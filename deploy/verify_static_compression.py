#!/usr/bin/env python3
"""Native Nginx integration gate in an isolated loopback process; no live reload."""
import argparse
import gzip
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import os
import signal
import time
import socket
import subprocess
import tempfile
from threading import Thread


def fetch(port, path, encoding):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", path, headers={"Accept-Encoding": encoding})
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read(1024 * 1024)
    finally:
        connection.close()


def verify(config, binary="nginx"):
    private_body = b'{"synthetic_token":"not-a-real-secret","padding":"' + b"x"*65536 + b'"}'

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(private_body)))
            self.end_headers()
            self.wfile.write(private_body)

        def log_message(self, *_args):
            pass

    backend = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=backend.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="health-nginx-") as temporary:
            root = Path(temporary).resolve()
            root.chmod(0o755)  # Only public synthetic fixtures live here.
            assets = root / "public" / "assets"
            assets.mkdir(parents=True)
            (root / "public").chmod(0o755)
            assets.chmod(0o755)
            (root / "public" / "current").mkdir()
            (root / "public" / "current").chmod(0o755)
            (root / "public" / "current" / "index.html").write_text("synthetic")
            (root / "public" / "current" / "index.html").chmod(0o644)
            fixtures = {"fixture.js": b"/* synthetic public JS */\n"*4096,
                        "fixture.css": b"/* synthetic public CSS */\n"*4096,
                        "fixture.ttf": bytes(range(256))*512}
            for name, body in fixtures.items():
                (assets / name).write_bytes(body)
                (assets / name).chmod(0o644)
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                port = listener.getsockname()[1]
            source = config.read_text()
            if source.count("\nserver {") != 1:
                raise ValueError("Unexpected server layout")
            source = "server {" + source.split("\nserver {", 1)[1]
            source, count = re.subn(r"    listen 443 ssl http2;", f"    listen 127.0.0.1:{port};", source)
            if count != 1 or source.count("http://127.0.0.1:53101") != 1:
                raise ValueError("Unexpected listener or proxy layout")
            source = re.sub(r"^    (?:listen \[::\]|ssl_).*\n", "", source, flags=re.MULTILINE)
            source = source.replace("/var/www/health", str(root / "public"))
            source = source.replace("http://127.0.0.1:53101", f"http://127.0.0.1:{backend.server_port}")
            listeners = re.findall(r"^\s*listen\s+([^;]+);", source, flags=re.MULTILINE)
            if ([item.strip() for item in listeners] != [f"127.0.0.1:{port}"]
                    or re.search(r"^\s*include\s", source, flags=re.MULTILINE)):
                raise ValueError("Unsupported isolated listener or include")
            native = root / "nginx.conf"
            # Deliberately enable JSON globally: the API location must still opt out.
            native.write_text(f"pid {root}/nginx.pid;\nerror_log /dev/null;\nevents {{}}\n"
                              "http { include /etc/nginx/mime.types; default_type application/octet-stream; access_log off; gzip on; "
                              "gzip_types application/json;\n" + source + "\n}\n")
            command = [binary, "-p", str(root), "-c", str(native)]
            process = None
            try:
                subprocess.run([*command, "-t"], check=True, stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL, timeout=10)
                process = subprocess.Popen([*command, "-g", "daemon off;"], stdout=subprocess.DEVNULL,
                                           stderr=subprocess.DEVNULL, start_new_session=True)
                expires = time.monotonic() + 10
                while True:
                    if process.poll() is not None:
                        raise RuntimeError("Isolated Nginx exited before readiness")
                    try:
                        if fetch(port, "/", "identity")[0] != 200:
                            raise ValueError("Isolated Nginx readiness mismatch")
                        break
                    except OSError:
                        if time.monotonic() >= expires:
                            raise TimeoutError("Isolated Nginx readiness deadline")
                        time.sleep(0.02)  # Condition polling, not an assumed startup delay.
                for name, expected in fixtures.items():
                    status, headers, body = fetch(port, "/assets/" + name, "gzip")
                    if status != 200 or headers.get("Content-Encoding") != "gzip" or gzip.decompress(body) != expected:
                        raise ValueError(f'Public gzip mismatch: {name}, status={status}, type={headers.get("Content-Type")}, encoding={headers.get("Content-Encoding")}')
                    if "Accept-Encoding" not in headers.get("Vary", "") or "max-age=" not in headers.get("Cache-Control", ""):
                        raise ValueError("Public cache negotiation mismatch")
                    status, headers, body = fetch(port, "/assets/" + name, "identity")
                    if status != 200 or "Content-Encoding" in headers or body != expected:
                        raise ValueError("Public identity mismatch")
                    for header in ("Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy"):
                        if header not in headers:
                            raise ValueError("Public security header missing")
                status, headers, body = fetch(port, "/api/synthetic", "gzip")
                if status != 200 or "Content-Encoding" in headers or body != private_body or headers.get("Cache-Control") != "no-store":
                    raise ValueError("Private response compression or bytes mismatch")
                print("Native Nginx: JS/CSS/TTF gzip+identity, bytes, Vary/cache/CSP and API identity OK")
            finally:
                if process is not None:
                    try:
                        os.killpg(process.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        try:
                            os.killpg(process.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        process.wait(timeout=5)
    finally:
        backend.shutdown()
        backend.server_close()
        thread.join()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    args = parser.parse_args()
    verify(args.config)
