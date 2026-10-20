#!/usr/bin/env python3
"""Read-only bounded API probe from the frontend VPS; no notifications."""
import http.client
import json
import signal


class DeadlineExceeded(Exception):
    pass


def deadline(_number, _frame):
    raise DeadlineExceeded()


def read_status(path, expected, port=53101):
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", "/api/v1/" + path, headers={"Accept": "application/json"})
        response = connection.getresponse()
        body = response.read(1025)
        if len(body) > 1024:
            return "invalid_response"
        if response.status == 503 and path == "readiness":
            return "not_ready" if json.loads(body) == {"status": "unavailable"} else "invalid_response"
        if response.status != 200:
            return "invalid_response"
        value = json.loads(body)
        return expected if value == {"status": expected} else "invalid_response"
    except (OSError, http.client.HTTPException):
        return "unavailable"
    except (ValueError, UnicodeError):
        return "invalid_response"
    finally:
        connection.close()


def check(port=53101):
    health = read_status("health", "ok", port)
    readiness = read_status("readiness", "ready", port)
    return {"version": 1, "status": "healthy" if health == "ok" and readiness == "ready" else "unhealthy",
            "health": health, "readiness": readiness}


def main():
    try:
        report = check()
    except DeadlineExceeded:
        report = {"version": 1, "status": "unhealthy", "health": "unknown", "readiness": "unknown"}
    print(json.dumps(report))
    return 0 if report["status"] == "healthy" else 1


if __name__ == "__main__":
    signal.signal(signal.SIGALRM, deadline)
    signal.alarm(15)
    try:
        raise SystemExit(main())
    finally:
        signal.alarm(0)
