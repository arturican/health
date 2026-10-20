from contextlib import redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from threading import Thread
import unittest
from unittest.mock import patch
from watchdog_probe import check, deadline, DeadlineExceeded, main, read_status


class ProbeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                status, body = cls.responses[self.path]
                cls.paths.append((self.command, self.path))
                if self.headers.get("Authorization") or self.headers.get("Cookie"):
                    raise AssertionError("Probe must not send credentials")
                self.send_response(status)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_args):
                pass

        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        type(self).responses = {"/api/v1/health": (200, b'{"status":"ok"}'),
                                "/api/v1/readiness": (200, b'{"status":"ready"}')}
        type(self).paths = []

    def test_exact_status_and_no_auth_or_mutations(self):
        self.assertEqual(check(self.server.server_port),
                         {"version": 1, "status": "healthy", "health": "ok", "readiness": "ready"})
        self.assertEqual(self.paths, [("GET", "/api/v1/health"), ("GET", "/api/v1/readiness")])

    def test_not_ready_does_not_claim_health_equals_ready(self):
        self.responses["/api/v1/readiness"] = (503, b'{"status":"unavailable"}')
        self.assertEqual(check(self.server.server_port),
                         {"version": 1, "status": "unhealthy", "health": "ok", "readiness": "not_ready"})

    def test_not_ready_requires_bounded_exact_payload(self):
        for body in [b"x"*1025, b"<html>unavailable</html>", b'{"status":"ready"}']:
            self.responses["/api/v1/readiness"] = (503, body)
            self.assertEqual(read_status("readiness", "ready", self.server.server_port), "invalid_response")

    def test_invalid_payload_status_redirect_and_oversize(self):
        for status, body in [(302, b""), (401, b"private"), (200, b"x"*1025),
                             (200, b'{"status":"ok","private":"sentinel"}'), (200, b"not json"),
                             (200, b'{"status":"ready"}'), (200, b"\xff")]:
            with self.subTest(status=status, body_size=len(body)):
                self.responses["/api/v1/health"] = (status, body)
                self.assertEqual(read_status("health", "ok", self.server.server_port), "invalid_response")
        self.assertEqual(len(self.paths), 7)  # No follow-up redirect request.

    def test_connection_failure_timeout_are_safe(self):
        for error in [ConnectionRefusedError("private"), TimeoutError("private")]:
            with patch("watchdog_probe.http.client.HTTPConnection", side_effect=error):
                # Constructor is not responsible for connecting; production constructor
                # errors propagate as configuration/programming faults, unlike socket IO.
                with self.assertRaises(type(error)):
                    read_status("health", "ok")
            with patch("watchdog_probe.http.client.HTTPConnection") as factory:
                factory.return_value.request.side_effect = error
                self.assertEqual(read_status("health", "ok"), "unavailable")
                factory.return_value.close.assert_called_once()

    def test_deadline_cannot_be_swallowed_by_socket_failure_handling(self):
        with self.assertRaises(DeadlineExceeded):
            deadline(0, None)
        with patch("watchdog_probe.check", side_effect=DeadlineExceeded):
            output = io.StringIO()
            with redirect_stdout(output):
                self.assertEqual(main(), 1)
            self.assertEqual(json.loads(output.getvalue()),
                             {"version": 1, "status": "unhealthy", "health": "unknown", "readiness": "unknown"})
