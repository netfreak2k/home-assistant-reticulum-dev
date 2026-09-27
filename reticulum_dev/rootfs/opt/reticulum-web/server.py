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



def get_usb_devices():
    """Return USB devices visible inside the add-on container."""
    devices = []

    for entry in sorted(Path("/sys/bus/usb/devices").glob("*")):
        if not (entry / "idVendor").exists():
            continue

        def read(name):
            try:
                return (entry / name).read_text().strip()
            except Exception:
                return ""

        devices.append({
            "sysfs": entry.name,
            "vendor_id": read("idVendor"),
            "product_id": read("idProduct"),
            "manufacturer": read("manufacturer"),
            "product": read("product"),
            "serial": bool(read("serial")),
        })

    return devices


def get_serial_devices():
    """Return unique serial devices, preferring stable by-id paths."""
    found = []

    patterns = [
        "/dev/serial/by-id/*",
        "/dev/ttyACM*",
        "/dev/ttyUSB*",
    ]

    for pattern in patterns:
        for device in sorted(Path("/").glob(pattern.lstrip("/"))):
            try:
                resolved = str(device.resolve())
            except Exception:
                resolved = str(device)

            found.append({
                "path": str(device),
                "resolved": resolved,
            })

    # Multiple paths can point to the same physical serial device.
    # Since by-id is scanned first, it becomes the preferred path.
    unique = []
    seen_resolved = set()

    for device in found:
        key = device["resolved"]

        if key in seen_resolved:
            continue

        seen_resolved.add(key)
        unique.append(device)

    return unique


def probe_rnode(port):
    """Read-only probe of a serial device using rnodeconf."""
    try:
        result = subprocess.run(
            ["rnodeconf", "-i", port],
            capture_output=True,
            text=True,
            timeout=5,
        )

        output = (result.stdout + "\n" + result.stderr).strip()

        detected = result.returncode == 0

        return {
            "detected": detected,
            "device_present": True,
            "result": "rnode" if detected else "serial_device_only",
            "returncode": result.returncode,
            "info": output,
        }

    except subprocess.TimeoutExpired:
        return {
            "detected": False,
            "device_present": True,
            "result": "unknown_serial_device",
            "returncode": None,
            "info": "Serial device present, but no RNode response",
        }

    except Exception as exc:
        return {
            "detected": False,
            "returncode": None,
            "info": str(exc),
        }


def parse_rnstatus(text):
    import re

    data = {
        "shared_instance": None,
        "interfaces": [],
    }

    shared = re.search(
        r"Shared Instance\[(.*?)\].*?"
        r"Status\s*:\s*(\w+).*?"
        r"Serving\s*:\s*(\d+) programs.*?"
        r"Rate\s*:\s*([^,]+), MTU (\d+)",
        text,
        re.S,
    )

    if shared:
        data["shared_instance"] = {
            "name": shared.group(1),
            "status": shared.group(2),
            "serving": int(shared.group(3)),
            "rate": shared.group(4).strip(),
            "mtu": int(shared.group(5)),
        }

        block = text[shared.start():]
        traffic = re.search(
            r"Traffic\s*:\s*↑\s*([^\n]+?)\s{2,}([^\s]+\s+bps).*?"
            r"↓\s*([^\n]+?)\s{2,}([^\s]+\s+bps)",
            block,
            re.S,
        )
        if traffic:
            data["shared_instance"]["tx"] = traffic.group(1).strip()
            data["shared_instance"]["tx_rate"] = traffic.group(2).strip()
            data["shared_instance"]["rx"] = traffic.group(3).strip()
            data["shared_instance"]["rx_rate"] = traffic.group(4).strip()

    # Parse all Reticulum interfaces, not only AutoInterface.
    interface_header = re.compile(
        r"^\s*([A-Za-z][A-Za-z0-9_]*)\[(.*?)\]\s*$",
        re.M,
    )

    matches = list(interface_header.finditer(text))

    for pos, match in enumerate(matches):
        interface_type = match.group(1)

        # Shared Instance is handled separately above.
        if interface_type == "Instance":
            continue

        block_end = matches[pos + 1].start() if pos + 1 < len(matches) else len(text)
        block = text[match.start():block_end]

        status = re.search(r"Status\s*:\s*(\w+)", block)
        mode = re.search(r"Mode\s*:\s*(\w+)", block)
        rate = re.search(r"Rate\s*:\s*([^,\n]+),\s*MTU\s*(\d+)", block)
        peers = re.search(r"Peers\s*:\s*(\d+)\s+reachable", block)

        item = {
            "type": interface_type,
            "name": match.group(2),
            "status": status.group(1) if status else None,
            "mode": mode.group(1) if mode else None,
            "rate": rate.group(1).strip() if rate else None,
            "mtu": int(rate.group(2)) if rate else None,
            "peers": int(peers.group(1)) if peers else None,
        }

        traffic = re.search(
            r"Traffic\s*:\s*↑\s*([^\n]+?)\s{2,}([^\s]+\s+bps).*?"
            r"↓\s*([^\n]+?)\s{2,}([^\s]+\s+bps)",
            block,
            re.S,
        )

        if traffic:
            item["tx"] = traffic.group(1).strip()
            item["tx_rate"] = traffic.group(2).strip()
            item["rx"] = traffic.group(3).strip()
            item["rx_rate"] = traffic.group(4).strip()

        data["interfaces"].append(item)

    return data


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

    parsed = parse_rnstatus(rnstatus["stdout"])

    return {
        "service": "reticulum",
        "online": rnstatus["ok"],
        "uptime_seconds": int(time.time() - START_TIME),
        "version": version["stdout"],
        "shared_instance": parsed["shared_instance"],
        "interfaces": parsed["interfaces"],
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

        if path.endswith("/api/hardware"):
            self.send_json({
                "serial_devices": get_serial_devices()
            })
            return

        if path.endswith("/api/usb"):
            self.send_json({
                "usb_devices": get_usb_devices()
            })
            return

        if path.endswith("/api/rnode/probe"):
            devices = get_serial_devices()

            if len(devices) == 0:
                self.send_json({
                    "detected": False,
                    "error": "No serial device found"
                }, 404)
                return

            if len(devices) > 1:
                self.send_json({
                    "detected": False,
                    "error": "Multiple serial devices found",
                    "serial_devices": devices
                }, 409)
                return

            port = devices[0]["path"]
            result = probe_rnode(port)
            result["port"] = port

            self.send_json(result)
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
