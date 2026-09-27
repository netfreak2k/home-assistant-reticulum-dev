#!/usr/bin/env python3

import json
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "0.0.0.0"
PORT = 8100

CONFIG_DIR = "/config/reticulum"
STATIC_DIR = Path("/opt/reticulum-web/static")

START_TIME = time.time()


def run_command(command, timeout=5):
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

        return {
            "ok": result.returncode == 0,
            "returncode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }

    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "returncode": -1,
            "stdout": "",
            "stderr": "Command timed out",
        }

    except Exception as exc:
        return {
            "ok": False,
            "returncode": -1,
            "stdout": "",
            "stderr": str(exc),
        }


def get_status():
    rnstatus = run_command([
        "rnstatus",
        "--config",
        CONFIG_DIR,
    ])

    version = run_command([
        "rnsd",
        "--version",
    ])

    return {
        "service": "reticulum",
        "online": rnstatus["ok"],
        "uptime_seconds": int(time.time() - START_TIME),
        "version": version["stdout"],
        "rnstatus": rnstatus["stdout"],
        "error": rnstatus["stderr"],
        "timestamp": int(time.time()),
    }


class Handler(BaseHTTPRequestHandler):

    def send_json(self, data, status=200):
        payload = json.dumps(
            data,
            indent=2,
            ensure_ascii=False
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8"
        )
        self.send_header(
            "Content-Length",
            str(len(payload))
        )
        self.send_header(
            "Cache-Control",
            "no-store"
        )
        self.end_headers()

        self.wfile.write(payload)


    def do_GET(self):

        path = self.path.split("?", 1)[0]

        # Home Assistant Ingress can prepend a dynamic
        # path prefix. Match endpoints by suffix.

        if path.endswith("/health"):
            self.send_json({
                "status": "ok"
            })
            return

        if path.endswith("/api/status"):
            self.send_json(get_status())
            return

        if (
            path == "/"
            or path.endswith("/index.html")
            or not "." in path.rsplit("/", 1)[-1]
        ):

            index = STATIC_DIR / "index.html"

            if not index.exists():
                self.send_error(404)
                return

            payload = index.read_bytes()

            self.send_response(200)
            self.send_header(
                "Content-Type",
                "text/html; charset=utf-8"
            )
            self.send_header(
                "Content-Length",
                str(len(payload))
            )
            self.send_header(
                "Cache-Control",
                "no-store"
            )
            self.end_headers()

            self.wfile.write(payload)
            return

        self.send_error(404)


    def log_message(self, format, *args):
        print(
            "[WEB]",
            self.address_string(),
            format % args,
            flush=True
        )


def main():

    print(
        f"[WEB] Reticulum status server starting on {HOST}:{PORT}",
        flush=True
    )

    server = ThreadingHTTPServer(
        (HOST, PORT),
        Handler
    )

    server.serve_forever()


if __name__ == "__main__":
    main()
