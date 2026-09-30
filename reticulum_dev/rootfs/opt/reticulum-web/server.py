#!/usr/bin/env python3

import json
import socket
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import uuid
import os
import threading
import urllib.request
import urllib.parse
import io
import re
import base64

import qrcode
import qrcode.image.svg

HOST = "0.0.0.0"
PORT = 8100

CONFIG_DIR = "/config/reticulum"
STATIC_DIR = Path("/opt/reticulum-web/static")

START_TIME = time.time()


SHARED_BRIDGE_DIR = Path(
    "/homeassistant/reticulum_bridge"
)


def write_bridge_snapshot(
    name: str,
    data,
):
    """Atomically publish data for Home Assistant/MCP."""

    SHARED_BRIDGE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    target = (
        SHARED_BRIDGE_DIR /
        f"{name}.json"
    )

    temporary = target.with_suffix(
        ".json.tmp"
    )

    temporary.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    temporary.replace(target)


def publish_mcp_snapshots():
    """Publish read-only Reticulum snapshots."""

    snapshots = {
        "status": get_status(),
        "identity": get_node_identity_status(),
        "contacts": get_messenger_contacts(),
        "messages": get_messenger_data(),
    }

    for name, data in snapshots.items():
        write_bridge_snapshot(
            name,
            data,
        )

    return {
        "ok": True,
        "files": list(snapshots),
        "timestamp": int(time.time()),
    }



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




def get_addon_options():
    """Read current add-on options from Home Assistant Supervisor."""
    import os
    import urllib.request

    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        raise RuntimeError("SUPERVISOR_TOKEN nicht vorhanden")

    request = urllib.request.Request(
        "http://supervisor/addons/self/info",
        headers={"Authorization": "Bearer " + token},
    )

    with urllib.request.urlopen(request, timeout=5) as response:
        info = json.loads(response.read().decode("utf-8"))

    addon_info = info.get("data") or {}
    options = addon_info.get("options") or {}

    if not isinstance(options, dict):
        raise RuntimeError("Ungültige Add-on-Optionen")

    return dict(options)


def schedule_addon_restart(delay=1.5):
    """Restart this add-on shortly after the HTTP response is sent."""
    token = os.environ.get("SUPERVISOR_TOKEN", "").strip()

    if not token:
        return False

    def restart():
        try:
            request = urllib.request.Request(
                "http://supervisor/addons/self/restart",
                data=b"{}",
                method="POST",
                headers={
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json",
                },
            )

            with urllib.request.urlopen(
                request,
                timeout=10,
            ) as response:
                response.read()

        except Exception as exc:
            print(
                "ADD-ON RESTART ERROR:",
                str(exc),
            )

    timer = threading.Timer(
        max(0.5, float(delay)),
        restart,
    )
    timer.daemon = True
    timer.start()

    return True


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

        driver = ""
        interface_class = ""
        interface_subclass = ""
        interface_protocol = ""

        for interface in sorted(
            Path("/sys/bus/usb/devices").glob(entry.name + ":*")
        ):
            def iread(name):
                try:
                    return (interface / name).read_text().strip()
                except Exception:
                    return ""

            if not interface_class:
                interface_class = iread("bInterfaceClass")
                interface_subclass = iread("bInterfaceSubClass")
                interface_protocol = iread("bInterfaceProtocol")

            link = interface / "driver"
            try:
                driver = link.resolve().name
                if driver:
                    break
            except Exception:
                pass

        devices.append({
            "sysfs": entry.name,
            "driver": driver,
            "interface_class": interface_class,
            "interface_subclass": interface_subclass,
            "interface_protocol": interface_protocol,
            "vendor_id": read("idVendor"),
            "product_id": read("idProduct"),
            "manufacturer": read("manufacturer"),
            "product": read("product"),
            "serial": read("serial"),
            "usb_version": read("version"),
            "device_version": read("bcdDevice"),
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
            timeout=15,
        )

        output = (result.stdout + "\n" + result.stderr).strip()

        detected = result.returncode == 0

        return {
            "detected": detected,
            "device_present": True,
            "result": "RNODE_CONFIRMED" if detected else "NO_RNODE_RESPONSE",
            "returncode": result.returncode,
            "info": output,
        }

    except subprocess.TimeoutExpired:
        return {
            "detected": False,
            "device_present": True,
            "result": "PROBE_TIMEOUT",
            "returncode": None,
            "info": "Serial device present, but no RNode response within 15 seconds",
        }

    except Exception as exc:
        return {
            "detected": False,
            "device_present": True,
            "result": "PROBE_ERROR",
            "returncode": None,
            "info": str(exc),
        }




def build_node_fingerprint(port, serial_device, usb_devices):
    """Build a passive hardware fingerprint without opening serial."""

    fingerprint = {
        "serial_port": port,
        "resolved_port": (
            serial_device.get("resolved", "")
            if serial_device else ""
        ),
        "usb_match": None,
        "usb_identity": "UNKNOWN",
        "firmware_state": "UNKNOWN",
        "rnode_capable": None,
    }

    # A stable by-id path commonly contains the USB serial number.
    # Match only against observed USB metadata; do not infer firmware.
    candidates = []

    for usb in usb_devices:
        serial = str(usb.get("serial") or "").strip()

        score = 0

        if serial and serial in port:
            score += 100

        if (
            usb.get("driver") in ("cdc_acm", "cp210x", "ch341", "ftdi_sio")
        ):
            score += 10

        if score:
            candidates.append((score, usb))

    if candidates:
        candidates.sort(key=lambda item: item[0], reverse=True)
        usb = candidates[0][1]

        fingerprint["usb_match"] = usb
        fingerprint["usb_identity"] = "{}:{}".format(
            usb.get("vendor_id") or "????",
            usb.get("product_id") or "????"
        )

    return fingerprint


def inspect_rnode(port):
    """Manual, non-mutating compatibility inspection."""
    devices = get_serial_devices()
    usb_devices = get_usb_devices()

    serial = next(
        (d for d in devices if d.get("path") == port),
        None
    )

    fingerprint = build_node_fingerprint(
        port,
        serial,
        usb_devices
    )

    report = {
        "ok": True,
        "port": port,
        "serial": serial,
        "serial_devices": devices,
        "usb_devices": usb_devices,
        "fingerprint": fingerprint,
        "safety": {
            "manual_only": True,
            "flash_performed": False,
            "rf_changed": False,
            "activation_changed": False,
        },
    }

    if serial is None:
        report["state"] = "PORT_MISSING"
        report["rnode"] = {
            "detected": False,
            "result": "SAVED_PORT_MISSING",
        }
        return report

    probe = probe_rnode(port)
    report["rnode"] = probe

    state = probe.get("result")

    if state == "RNODE_CONFIRMED":
        fingerprint["firmware_state"] = "RNODE_CONFIRMED"
        fingerprint["rnode_capable"] = True
        report["integration"] = "READY_FOR_RNODE_CONFIGURATION"
        report["state"] = "RNODE_CONFIRMED"
        report["conclusion"] = (
            "Das angeschlossene Gerät antwortet auf das "
            "RNode-Protokoll."
        )
    elif state == "PROBE_TIMEOUT":
        fingerprint["firmware_state"] = "NOT_IDENTIFIED"
        fingerprint["rnode_capable"] = False
        report["integration"] = "RNODE_PROTOCOL_NOT_CONFIRMED"
        report["state"] = "SERIAL_OK_RNODE_TIMEOUT"
        report["conclusion"] = (
            "USB und Serial sind verfügbar, aber innerhalb "
            "des Prüfzeitraums kam keine RNode-Antwort."
        )
    elif state == "NO_RNODE_RESPONSE":
        fingerprint["firmware_state"] = "NOT_IDENTIFIED"
        fingerprint["rnode_capable"] = False
        report["integration"] = "RNODE_PROTOCOL_NOT_CONFIRMED"
        report["state"] = "SERIAL_OK_NO_RNODE"
        report["conclusion"] = (
            "Das Serial-Gerät antwortete nicht als "
            "kompatibles RNode."
        )
    else:
        fingerprint["firmware_state"] = "UNKNOWN"
        fingerprint["rnode_capable"] = None
        report["integration"] = "INSPECTION_INCOMPLETE"
        report["state"] = "PROBE_ERROR"
        report["conclusion"] = (
            "Der manuelle RNode-Test konnte nicht "
            "abgeschlossen werden."
        )

    return report


def parse_rnstatus(text):
    import re

    data = {
        "shared_instance": None,
        "interfaces": [],
    }

    # -----------------------------------------------------
    # Shared Instance
    #
    # RNS output differs slightly between versions/builds.
    # Do not require every field to exist in one regex.
    # -----------------------------------------------------

    shared_header = re.search(
        r"^\s*Shared\s+Instance(?:\[(.*?)\])?\s*$",
        text,
        re.M | re.I,
    )

    if shared_header:
        next_header = re.search(
            r"^\s*[A-Za-z][A-Za-z0-9_]*\[.*?\]\s*$",
            text[shared_header.end():],
            re.M,
        )

        if next_header:
            block_end = (
                shared_header.end()
                + next_header.start()
            )
        else:
            block_end = len(text)

        block = text[
            shared_header.start():block_end
        ]

        def field(pattern):
            match = re.search(
                pattern,
                block,
                re.I | re.M,
            )
            return (
                match.group(1).strip()
                if match else None
            )

        name = (
            shared_header.group(1)
            or "Shared Instance"
        )

        serving_raw = field(
            r"Serving\s*:\s*(\d+)"
        )

        mtu_raw = field(
            r"MTU\s*:?\s*(\d+)"
        )

        # Some rnstatus versions print:
        # Rate : 1.00 Mbps, MTU 1064
        rate_match = re.search(
            r"Rate\s*:\s*([^,\n]+)"
            r"(?:,\s*MTU\s*:?\s*(\d+))?",
            block,
            re.I,
        )

        shared = {
            "name": name,
            "status": field(
                r"Status\s*:\s*([^\n]+)"
            ),
            "serving": (
                int(serving_raw)
                if serving_raw is not None
                else None
            ),
            "rate": (
                rate_match.group(1).strip()
                if rate_match else None
            ),
            "mtu": (
                int(rate_match.group(2))
                if rate_match
                and rate_match.group(2)
                else (
                    int(mtu_raw)
                    if mtu_raw is not None
                    else None
                )
            ),
        }

        traffic = re.search(
            r"Traffic\s*:\s*"
            r"↑\s*([^\n]+?)\s{2,}"
            r"([^\s]+\s+bps).*?"
            r"↓\s*([^\n]+?)\s{2,}"
            r"([^\s]+\s+bps)",
            block,
            re.S | re.I,
        )

        if traffic:
            shared["tx"] = traffic.group(1).strip()
            shared["tx_rate"] = traffic.group(2).strip()
            shared["rx"] = traffic.group(3).strip()
            shared["rx_rate"] = traffic.group(4).strip()

        data["shared_instance"] = shared

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

        noise_line = re.search(
            r"Noise\s+Fl\.\s*:\s*([^\n]+)",
            block,
            re.I,
        )
        noise_dbm = re.search(
            r"(-?\d+(?:\.\d+)?)\s*dBm",
            noise_line.group(1) if noise_line else "",
            re.I,
        )
        airtime = re.search(
            r"Airtime\s*:\s*([0-9.]+)%\s*\(15s\),"
            r"\s*([0-9.]+)%\s*\(1h\)",
            block,
            re.I,
        )
        channel_load = re.search(
            r"Ch\.\s*Load\s*:\s*([0-9.]+)%\s*\(15s\),"
            r"\s*([0-9.]+)%\s*\(1h\)",
            block,
            re.I,
        )
        cpu_load = re.search(
            r"CPU\s+load\s*:\s*([^\n]+)",
            block,
            re.I,
        )

        item = {
            "type": interface_type,
            "name": match.group(2),
            "status": status.group(1) if status else None,
            "mode": mode.group(1) if mode else None,
            "rate": rate.group(1).strip() if rate else None,
            "mtu": int(rate.group(2)) if rate else None,
            "peers": int(peers.group(1)) if peers else None,
            "noise_floor_dbm": (
                float(noise_dbm.group(1))
                if noise_dbm else None
            ),
            "noise_floor_text": (
                noise_line.group(1).strip()
                if noise_line else None
            ),
            "cpu_load": (
                cpu_load.group(1).strip()
                if cpu_load else None
            ),
            "airtime_15s_percent": (
                float(airtime.group(1))
                if airtime else None
            ),
            "airtime_1h_percent": (
                float(airtime.group(2))
                if airtime else None
            ),
            "channel_load_15s_percent": (
                float(channel_load.group(1))
                if channel_load else None
            ),
            "channel_load_1h_percent": (
                float(channel_load.group(2))
                if channel_load else None
            ),
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



def get_internet_diagnostic():
    """
    Passive connectivity diagnostics only.
    No Reticulum configuration, serial device or RF state is changed.
    """

    peers = [
        {
            "name": "Sideband Hub",
            "host": "sideband.connect.reticulum.network",
            "port": 7822,
            "transport_identity": "521c87a83afb8f29e4455e77930b973b",
            "source": "official_rns_1_5_4",
        },
        {
            "name": "One Big Network",
            "host": "rns.one-big.network",
            "port": 4242,
            "source": "directory",
        },
        {
            "name": "NodeRage",
            "host": "rns.noderage.org",
            "port": 4242,
            "source": "directory",
        },
        {
            "name": "NEPAMesh",
            "host": "reticulum.nepamesh.com",
            "port": 4242,
            "source": "directory",
        },
        {
            "name": "Washmesh",
            "host": "reticulum.washmesh.net",
            "port": 7242,
            "source": "directory",
        },
        {
            "name": "Reticulum World",
            "host": "rns.reticulum.world",
            "port": 6666,
            "source": "directory",
        },
        {
            "name": "Not A Number",
            "host": "rns.not-a-number.io",
            "port": 4242,
            "source": "directory",
        },
    ]

    results = []

    for peer in peers:
        host = peer["host"]
        port = peer["port"]

        result = {
            "name": peer["name"],
            "host": host,
            "port": port,
            "transport_identity": peer.get("transport_identity"),
            "source": peer.get("source"),
            "dns": False,
            "addresses": [],
            "tcp": False,
            "latency_ms": None,
            "error": None,
        }

        try:
            infos = socket.getaddrinfo(
                host,
                port,
                type=socket.SOCK_STREAM,
            )

            addresses = []
            for info in infos:
                address = info[4][0]
                if address not in addresses:
                    addresses.append(address)

            result["addresses"] = addresses
            result["dns"] = bool(addresses)

        except Exception as exc:
            result["error"] = "DNS: " + str(exc)
            results.append(result)
            continue

        try:
            started = time.monotonic()

            with socket.create_connection(
                (host, port),
                timeout=5,
            ):
                pass

            result["latency_ms"] = round(
                (time.monotonic() - started) * 1000,
                1,
            )
            result["tcp"] = True

        except Exception as exc:
            result["error"] = "TCP: " + str(exc)

        results.append(result)

    dns_ok = any(peer["dns"] for peer in results)
    tcp_ok = any(peer["tcp"] for peer in results)

    if tcp_ok:
        path_state = "TCP_REACHABLE"
    elif dns_ok:
        path_state = "DNS_ONLY"
    else:
        path_state = "OFFLINE"

    return {
        "dns": dns_ok,
        "tcp": tcp_ok,
        "path_state": path_state,
        "peer_count": len(results),
        "reachable_peers": sum(
            1 for peer in results if peer["tcp"]
        ),
        "peers": results,
    }


def get_reticulum_discovery():
    """
    Passive Reticulum interface discovery.
    Uses rnstatus only; does not change configuration.
    """

    result = {
        "ok": False,
        "interfaces": [],
        "raw": "",
        "error": None,
    }

    command = run_command([
        "rnstatus",
        "-d",
        "--json",
        "--config",
        CONFIG_DIR,
    ])

    result["raw"] = command["stdout"]

    if not command["ok"]:
        result["error"] = command["stderr"] or "rnstatus discovery failed"
        return result

    try:
        parsed = json.loads(command["stdout"] or "{}")
        result["ok"] = True

        if isinstance(parsed, list):
            result["interfaces"] = parsed

        elif isinstance(parsed, dict):
            for key in ("interfaces", "discovered", "results"):
                value = parsed.get(key)
                if isinstance(value, list):
                    result["interfaces"] = value
                    break

            if not result["interfaces"]:
                result["data"] = parsed

    except Exception as exc:
        result["error"] = "JSON: " + str(exc)

    return result




def get_network_snapshot():
    """
    Read-only Reticulum network overview.

    Uses rnpath/rnstatus only. No identity generation,
    path requests, serial access or configuration changes.
    """

    result = {
        "ok": False,
        "timestamp": int(time.time()),
        "paths": [],
        "path_count": 0,
        "interfaces_total": 0,
        "interfaces_up": 0,
        "internet_total": 0,
        "internet_up": 0,
        "tx_bytes": 0,
        "rx_bytes": 0,
        "errors": [],
    }

    # ----------------------------------------------
    # Known Reticulum paths
    # ----------------------------------------------
    paths_cmd = run_command([
        "rnpath",
        "-t",
        "-j",
        "--config",
        CONFIG_DIR,
    ], timeout=8)

    if paths_cmd["ok"]:
        try:
            raw = json.loads(paths_cmd["stdout"] or "{}")

            candidates = []

            if isinstance(raw, list):
                candidates = raw

            elif isinstance(raw, dict):
                for key in (
                    "paths",
                    "path_table",
                    "entries",
                    "table",
                    "results",
                ):
                    value = raw.get(key)
                    if isinstance(value, list):
                        candidates = value
                        break

                # Some RNS versions may use destination
                # hashes as dictionary keys.
                if not candidates:
                    dictionary_entries = []

                    for key, value in raw.items():
                        if isinstance(value, dict):
                            entry = dict(value)
                            entry.setdefault("destination", key)
                            dictionary_entries.append(entry)

                    candidates = dictionary_entries

            normalised = []

            for item in candidates:
                if not isinstance(item, dict):
                    continue

                destination = (
                    item.get("destination")
                    or item.get("destination_hash")
                    or item.get("hash")
                    or item.get("dest")
                    or ""
                )

                next_hop = (
                    item.get("next_hop")
                    or item.get("via")
                    or item.get("received_from")
                    or ""
                )

                hops = item.get("hops")
                if hops is None:
                    hops = item.get("hop_count")

                expires = (
                    item.get("expires")
                    or item.get("expires_in")
                    or item.get("expiry")
                )

                interface = (
                    item.get("interface")
                    or item.get("interface_name")
                    or ""
                )

                normalised.append({
                    "destination": str(destination),
                    "next_hop": str(next_hop),
                    "hops": hops,
                    "expires": expires,
                    "interface": str(interface),
                })

            result["paths"] = normalised
            result["path_count"] = len(normalised)

        except Exception as exc:
            result["errors"].append(
                "rnpath JSON: " + str(exc)
            )
    else:
        result["errors"].append(
            "rnpath: " +
            (paths_cmd["stderr"] or "command failed")
        )

    # ----------------------------------------------
    # Current interface state / traffic
    # Reuse our proven rnstatus parser.
    # ----------------------------------------------
    status_cmd = run_command([
        "rnstatus",
        "--config",
        CONFIG_DIR,
    ], timeout=8)

    if status_cmd["ok"]:
        parsed = parse_rnstatus(status_cmd["stdout"])

        interfaces = parsed.get("interfaces", [])
        if not isinstance(interfaces, list):
            interfaces = []

        result["interfaces_total"] = len(interfaces)

        def is_up(interface):
            state = str(
                interface.get("status", "")
            ).strip().lower()

            return state in (
                "up",
                "online",
                "connected",
            )

        def is_internet(interface):
            name = str(
                interface.get("name", "")
            ).lower()

            kind = str(
                interface.get("type", "")
            ).lower()

            return (
                "tcp" in kind
                or "backbone" in kind
                or "tcp" in name
                or "backbone" in name
                or "bootstrap" in name
                or "internet" in name
            )

        up_interfaces = [
            interface
            for interface in interfaces
            if is_up(interface)
        ]

        internet_interfaces = [
            interface
            for interface in interfaces
            if is_internet(interface)
        ]

        internet_up = [
            interface
            for interface in internet_interfaces
            if is_up(interface)
        ]

        result["interfaces_up"] = len(up_interfaces)
        result["internet_total"] = len(internet_interfaces)
        result["internet_up"] = len(internet_up)

        def byte_value(value):
            if isinstance(value, (int, float)):
                return int(value)

            text = str(value or "").strip().lower()
            if not text:
                return 0

            try:
                parts = text.replace(",", ".").split()
                number = float(parts[0])
                unit = parts[1] if len(parts) > 1 else "b"

                factors = {
                    "b": 1,
                    "kb": 1000,
                    "mb": 1000 ** 2,
                    "gb": 1000 ** 3,
                    "kib": 1024,
                    "mib": 1024 ** 2,
                    "gib": 1024 ** 3,
                }

                return int(
                    number * factors.get(unit, 1)
                )
            except Exception:
                return 0

        tx_total = 0
        rx_total = 0

        for interface in interfaces:
            tx_total += byte_value(
                interface.get("tx", 0)
            )
            rx_total += byte_value(
                interface.get("rx", 0)
            )

        result["tx_bytes"] = tx_total
        result["rx_bytes"] = rx_total

    else:
        result["errors"].append(
            "rnstatus: " +
            (status_cmd["stderr"] or "command failed")
        )

    result["ok"] = status_cmd["ok"]

    return result






def update_messenger_profile(name):
    name = str(name or "").strip()

    if not name:
        return {
            "ok": False,
            "error": "Messenger-Name darf nicht leer sein",
        }

    if len(name) > 40:
        return {
            "ok": False,
            "error": "Messenger-Name maximal 40 Zeichen",
        }

    token = os.environ.get(
        "SUPERVISOR_TOKEN",
        ""
    ).strip()

    if not token:
        return {
            "ok": False,
            "error": "Supervisor API nicht verfügbar",
        }

    headers = {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    }

    try:
        # Aktuelle Add-on-Optionen lesen
        info_req = urllib.request.Request(
            "http://supervisor/addons/self/info",
            headers=headers,
            method="GET",
        )

        with urllib.request.urlopen(
            info_req,
            timeout=10,
        ) as response:
            info = json.loads(
                response.read().decode("utf-8") or "{}"
            )

        current = (
            info.get("data", {}).get("options")
            or info.get("options")
            or {}
        )

        if not isinstance(current, dict):
            current = {}

        current["messenger_name"] = name

        # Vollständige Optionen zurückschreiben
        save_req = urllib.request.Request(
            "http://supervisor/addons/self/options",
            data=json.dumps({
                "options": current
            }).encode("utf-8"),
            headers=headers,
            method="POST",
        )

        with urllib.request.urlopen(
            save_req,
            timeout=10,
        ) as response:
            raw = response.read().decode("utf-8")

        result = json.loads(raw or "{}")

        if result.get("result") != "ok":
            return {
                "ok": False,
                "error":
                    result.get("message")
                    or "Option konnte nicht gespeichert werden",
            }

        return {
            "ok": True,
            "messenger_name": name,
            "restart_required": True,
        }

    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8")
        except Exception:
            detail = str(exc)

        return {
            "ok": False,
            "error":
                f"Supervisor HTTP {exc.code}: {detail}",
        }

    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }



def request_lxmf_announce():
    state_dir = Path(
        "/config/reticulum/homeassistant-node"
    )
    state_file = state_dir / "state.json"
    request_file = state_dir / "lxmf-announce.request"

    if not state_file.exists():
        return {"ok": False, "error": "Node not ready"}

    try:
        state = json.loads(state_file.read_text())
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

    if not state.get("lxmf_destination_hash"):
        return {
            "ok": False,
            "error": "LXMF destination not ready",
        }

    now = int(time.time())
    last = int(state.get("lxmf_last_announce") or 0)

    if last and now-last < 60:
        return {
            "ok": False,
            "error": "LXMF announce cooldown active",
            "retry_after": 60-(now-last),
        }

    tmp=request_file.with_suffix(".tmp")
    tmp.write_text(json.dumps({
        "requested_at": now,
        "source": "homeassistant-web",
    }))
    tmp.replace(request_file)

    return {
        "ok": True,
        "queued": True,
        "destination_hash":
            state.get("lxmf_destination_hash"),
    }


def request_node_announce():
    state_dir = Path(
        "/config/reticulum/homeassistant-node"
    )
    state_file = state_dir / "state.json"
    request_file = state_dir / "announce.request"

    if not state_file.exists():
        return {
            "ok": False,
            "error": "Node service is not ready",
        }

    try:
        state = json.loads(state_file.read_text())
    except Exception as exc:
        return {
            "ok": False,
            "error": "Node state: " + str(exc),
        }

    if not state.get("identity_hash") or not state.get(
        "destination_hash"
    ):
        return {
            "ok": False,
            "error": "Node identity is not ready",
        }

    now = int(time.time())
    last = int(state.get("last_announce") or 0)

    if last and now - last < 60:
        return {
            "ok": False,
            "error": "Announce cooldown active",
            "retry_after": 60 - (now - last),
        }

    state_dir.mkdir(parents=True, exist_ok=True)

    tmp = request_file.with_suffix(".tmp")
    tmp.write_text(json.dumps({
        "requested_at": now,
        "source": "homeassistant-web",
    }))
    tmp.replace(request_file)

    return {
        "ok": True,
        "queued": True,
        "requested_at": now,
        "destination_hash": state.get(
            "destination_hash"
        ),
    }


def get_lxmf_inbox():
    inbox_file = Path(
        "/config/reticulum/homeassistant-node/lxmf-inbox.json"
    )

    if not inbox_file.exists():
        return {
            "ok": True,
            "count": 0,
            "messages": [],
        }

    try:
        data = json.loads(
            inbox_file.read_text()
        )

        if not isinstance(data, list):
            data = []

        # Neueste Nachricht zuerst.
        data = list(reversed(data))

        return {
            "ok": True,
            "count": len(data),
            "messages": data[:50],
        }

    except Exception as exc:
        return {
            "ok": False,
            "count": 0,
            "messages": [],
            "error": str(exc),
        }




def redact_n2k_value(value):
    text = str(value or "")

    if len(text) <= 10:
        return text

    return (
        text[:6]
        + "…"
        + text[-4:]
    )


def get_n2k_support_diagnostic():

    result = {
        "ok": True,
        "generated_at": int(time.time()),
        "product": "N2K RNS Gateway",
        "privacy": (
            "No message bodies or contact names "
            "are included."
        ),
    }

    # -------------------------------------------------
    # SELFTEST
    # -------------------------------------------------

    try:
        result["selftest"] = get_n2k_selftest()

    except Exception as exc:
        result["selftest"] = {
            "ok": False,
            "error": str(exc),
        }


    # -------------------------------------------------
    # IDENTITY · HASHES REDACTED
    # -------------------------------------------------

    try:
        identity = get_node_identity_status()

        result["identity"] = {
            "ok": identity.get("ok"),
            "state": identity.get("state"),
            "persistent": identity.get(
                "persistent"
            ),
            "state_age_seconds":
                identity.get(
                    "state_age_seconds"
                ),
            "identity_hash":
                redact_n2k_value(
                    identity.get(
                        "identity_hash"
                    )
                ),
            "destination_hash":
                redact_n2k_value(
                    identity.get(
                        "destination_hash"
                    )
                ),
            "lxmf_destination_hash":
                redact_n2k_value(
                    identity.get(
                        "lxmf_destination_hash"
                    )
                ),
        }

    except Exception as exc:
        result["identity"] = {
            "ok": False,
            "error": str(exc),
        }


    # -------------------------------------------------
    # NETWORK · NO MESSAGE DATA
    # -------------------------------------------------

    try:
        network = get_network_snapshot()

        result["network"] = {
            "ok": network.get("ok"),
            "interfaces_total":
                network.get(
                    "interfaces_total"
                ),
            "interfaces_up":
                network.get(
                    "interfaces_up"
                ),
            "internet_total":
                network.get(
                    "internet_total"
                ),
            "internet_up":
                network.get(
                    "internet_up"
                ),
            "path_count":
                network.get(
                    "path_count"
                ),
            "tx_bytes":
                network.get(
                    "tx_bytes"
                ),
            "rx_bytes":
                network.get(
                    "rx_bytes"
                ),
            "errors":
                network.get(
                    "errors",
                    []
                )[:10],
        }

    except Exception as exc:
        result["network"] = {
            "ok": False,
            "error": str(exc),
        }


    # -------------------------------------------------
    # RNode CONFIG · PORT ONLY, NO USB SERIAL NUMBERS
    # -------------------------------------------------

    try:
        options = get_addon_options()

        result["rnode"] = {
            "enabled":
                bool(
                    options.get(
                        "rnode_interface",
                        False,
                    )
                ),
            "port":
                str(
                    options.get(
                        "rnode_port",
                        "",
                    )
                ),
            "frequency":
                options.get(
                    "rnode_frequency"
                ),
            "bandwidth":
                options.get(
                    "rnode_bandwidth"
                ),
            "txpower":
                options.get(
                    "rnode_txpower"
                ),
            "spreadingfactor":
                options.get(
                    "rnode_spreadingfactor"
                ),
            "codingrate":
                options.get(
                    "rnode_codingrate"
                ),
        }

    except Exception as exc:
        result["rnode"] = {
            "ok": False,
            "error": str(exc),
        }


    return result


def get_n2k_selftest():
    checks = []

    def add_check(
        key,
        label,
        passed,
        detail="",
        optional=False,
    ):
        checks.append({
            "key": key,
            "label": label,
            "passed": bool(passed),
            "detail": str(detail or ""),
            "optional": bool(optional),
        })

    # -------------------------------------------------
    # Identity
    # -------------------------------------------------

    try:
        identity = get_node_identity_status()

        identity_hash = str(
            identity.get("identity_hash")
            or ""
        ).strip()

        destination_hash = str(
            identity.get("lxmf_destination_hash")
            or identity.get("destination_hash")
            or ""
        ).strip()

        persistent = bool(
            identity.get("persistent")
        )

        add_check(
            "identity",
            "Persistente Identity",
            persistent
            and bool(identity_hash)
            and bool(destination_hash),
            (
                "Identity "
                + (
                    identity_hash[:8] + "…"
                    if identity_hash
                    else "fehlt"
                )
                + " · LXMF "
                + (
                    destination_hash[:8] + "…"
                    if destination_hash
                    else "fehlt"
                )
            ),
        )

    except Exception as exc:
        add_check(
            "identity",
            "Persistente Identity",
            False,
            str(exc),
        )


    # -------------------------------------------------
    # Messenger storage
    # -------------------------------------------------

    try:
        contacts = get_messenger_contacts()

        add_check(
            "contacts",
            "Kontaktspeicher",
            contacts.get("ok") is True,
            str(
                contacts.get("count", 0)
            ) + " Kontakt(e)",
        )

    except Exception as exc:
        add_check(
            "contacts",
            "Kontaktspeicher",
            False,
            str(exc),
        )


    try:
        inbox = get_lxmf_inbox()

        add_check(
            "inbox",
            "LXMF Inbox",
            inbox.get("ok") is True,
            str(
                inbox.get("count", 0)
            ) + " Nachricht(en)",
        )

    except Exception as exc:
        add_check(
            "inbox",
            "LXMF Inbox",
            False,
            str(exc),
        )


    try:
        outbox = get_lxmf_outbox()

        add_check(
            "outbox",
            "LXMF Outbox",
            outbox.get("ok") is True,
            str(
                outbox.get("count", 0)
            ) + " Nachricht(en)",
        )

    except Exception as exc:
        add_check(
            "outbox",
            "LXMF Outbox",
            False,
            str(exc),
        )


    # -------------------------------------------------
    # LXMF propagation / Store & Forward
    # -------------------------------------------------

    try:
        propagation = get_propagation_config()

        if propagation.get("enabled"):
            node_hash = str(
                propagation.get("node") or ""
            ).strip().lower()

            auto_discovery = bool(
                propagation.get(
                    "auto_discovery",
                    True,
                )
            )

            runtime_node = str(
                propagation.get(
                    "runtime_node",
                    "",
                )
                or ""
            ).strip().lower()

            configured = (
                auto_discovery
                or bool(
                    re.fullmatch(
                        r"[0-9a-f]{32}",
                        node_hash,
                    )
                )
            )

            runtime_ok = (
                propagation.get("runtime_enabled") is True
                and bool(
                    re.fullmatch(
                        r"[0-9a-f]{32}",
                        runtime_node,
                    )
                )
                and (
                    auto_discovery
                    or runtime_node == node_hash
                )
            )

            add_check(
                "propagation",
                "LXMF Store & Forward",
                configured and runtime_ok,
                (
                    (
                        "Auto · "
                        if auto_discovery
                        else "Manuell · "
                    )
                    + runtime_node[:8]
                    + "… · Sync "
                    + (
                        propagation.get("sync_result")
                        or "bereit"
                    )
                    if configured and runtime_ok
                    else (
                        "Automatische Suche aktiv · noch kein Node gewählt"
                        if auto_discovery
                        else "Konfiguration gespeichert · Add-on-Neustart prüfen"
                    )
                ),
            )

        else:
            add_check(
                "propagation",
                "LXMF Store & Forward",
                True,
                "Optional · nicht aktiviert",
                optional=True,
            )

    except Exception as exc:
        add_check(
            "propagation",
            "LXMF Store & Forward",
            False,
            str(exc),
        )


    # -------------------------------------------------
    # UI feature bundle integrity
    # -------------------------------------------------

    try:
        index_text = (
            STATIC_DIR / "index.html"
        ).read_text(
            encoding="utf-8"
        )

        messenger_text = (
            STATIC_DIR / "messenger.js"
        ).read_text(
            encoding="utf-8"
        )

        feature_markers = {
            "scanner": "n2k-nearby-start",
            "announce": "m99-announce",
            "photo": "n2k-photo-pick",
            "emoji": "n2k-emoji-toggle",
            "resilience": "n2k-resilience-card",
            "propagation": "n2k-propagation-card",
        }

        missing = [
            name
            for name, value in feature_markers.items()
            if (
                value not in index_text
                and value not in messenger_text
            )
        ]

        add_check(
            "ui_bundle",
            "Messenger Feature Bundle",
            not missing,
            (
                "Scanner · Announce · Foto · Emoji · Resilience · Store & Forward"
                if not missing
                else "Fehlt: " + ", ".join(missing)
            ),
        )

    except Exception as exc:
        add_check(
            "ui_bundle",
            "Messenger Feature Bundle",
            False,
            str(exc),
        )


    # -------------------------------------------------
    # Reticulum network
    # -------------------------------------------------

    try:
        network = get_network_snapshot()

        add_check(
            "network",
            "Reticulum Stack",
            network.get("ok") is True,
            (
                str(
                    network.get(
                        "interfaces_up",
                        0,
                    )
                )
                + "/"
                + str(
                    network.get(
                        "interfaces_total",
                        0,
                    )
                )
                + " Interface(s) aktiv · "
                + str(
                    network.get(
                        "path_count",
                        0,
                    )
                )
                + " Pfade"
            ),
        )

    except Exception as exc:
        add_check(
            "network",
            "Reticulum Stack",
            False,
            str(exc),
        )


    # -------------------------------------------------
    # Serial / RNode
    # -------------------------------------------------

    try:
        devices = get_serial_devices()

        options = get_addon_options()

        rnode_enabled = bool(
            options.get(
                "rnode_interface",
                False,
            )
        )

        configured_port = str(
            options.get(
                "rnode_port",
                "",
            )
            or ""
        ).strip()

        device_paths = {
            str(
                item.get("path")
                or ""
            )
            for item in devices
            if isinstance(item, dict)
        }

        if not rnode_enabled:

            add_check(
                "rnode",
                "RNode / Serial",
                True,
                "Optional · nicht aktiviert",
                optional=True,
            )

        elif (
            configured_port
            and configured_port in device_paths
        ):

            add_check(
                "rnode",
                "RNode / Serial",
                True,
                configured_port,
            )

        else:

            add_check(
                "rnode",
                "RNode / Serial",
                False,
                (
                    configured_port
                    or "Kein Port konfiguriert"
                ),
            )

    except Exception as exc:

        add_check(
            "rnode",
            "RNode / Serial",
            False,
            str(exc),
        )


    required = [
        item
        for item in checks
        if not item.get("optional")
    ]

    passed = sum(
        1
        for item in required
        if item.get("passed")
    )

    failed = len(required) - passed

    failed_keys = [
        item.get("key")
        for item in required
        if not item.get("passed")
    ]

    if failed == 0:
        next_step = (
            "System bereit. Text, Announce, Scanner und bei Bedarf "
            "Mesh-Foto mit einem bekannten Kontakt testen."
        )
    elif "identity" in failed_keys:
        next_step = (
            "Add-on neu starten. Bleibt die Identity fehlerhaft, "
            "vor weiteren Änderungen ein Gateway-Backup prüfen."
        )
    elif "network" in failed_keys:
        next_step = (
            "Aktive Reticulum-Interfaces prüfen. Bei RNode zuerst "
            "USB/Port, sonst AutoInterface/TCP/Internet Bootstrap prüfen."
        )
    elif "rnode" in failed_keys:
        next_step = (
            "RNode-Verbindung und konfigurierten seriellen Port prüfen. "
            "Keine Identity oder Kontakte löschen."
        )
    else:
        next_step = (
            "Diagnose exportieren und den ersten FAIL-Eintrag prüfen. "
            "Keine weiteren Einstellungen auf Verdacht ändern."
        )

    return {
        "ok": failed == 0,
        "state":
            "PASS"
            if failed == 0
            else "FAIL",
        "passed": passed,
        "failed": failed,
        "checks": checks,
        "next_step": next_step,
        "timestamp": int(time.time()),
    }


def get_node_identity_status():
    state_file = Path(
        "/config/reticulum/homeassistant-node/state.json"
    )

    if not state_file.exists():
        return {
            "ok": False,
            "state": "STARTING",
            "error": "Node state not available yet",
        }

    try:
        data = json.loads(state_file.read_text())

        if not isinstance(data, dict):
            raise ValueError("invalid state format")

        now = int(time.time())
        updated = int(data.get("updated", 0) or 0)

        data["state_age_seconds"] = (
            max(0, now - updated)
            if updated else None
        )

        data["persistent"] = bool(
            data.get("identity_hash")
            and data.get("destination_hash")
        )

        return data

    except Exception as exc:
        return {
            "ok": False,
            "state": "ERROR",
            "error": str(exc),
        }


# ---------------------------------------------------------
# Status Snapshot Engine 0.67
#
# rnstatus/rnsd are intentionally NOT executed for every
# browser request. A short-lived snapshot protects the UI
# against slow CLI calls and request bursts.
# ---------------------------------------------------------

STATUS_CACHE = {
    "data": None,
    "updated": 0.0,
}

STATUS_CACHE_TTL = 8.0


def build_status_snapshot():
    rnstatus = run_command([
        "rnstatus",
        "--config",
        CONFIG_DIR,
    ], timeout=4)

    version = run_command([
        "rnsd",
        "--version",
    ], timeout=3)

    parsed = parse_rnstatus(
        rnstatus["stdout"]
    )

    # Passive health check only. No configuration,
    # serial or RF state is changed.
    try:
        internet_health = get_internet_diagnostic()
    except Exception as exc:
        internet_health = {
            "dns": False,
            "tcp": False,
            "path_state": "UNKNOWN",
            "peer_count": 0,
            "reachable_peers": 0,
            "peers": [],
            "error": str(exc),
        }

    return {
        "service": "reticulum",
        "online": rnstatus["ok"],
        "uptime_seconds": int(
            time.time() - START_TIME
        ),
        "version": version["stdout"],
        "shared_instance":
            parsed["shared_instance"],
        "interfaces":
            parsed["interfaces"],
        "internet_health":
            internet_health,
        "rnstatus":
            rnstatus["stdout"],
        "error":
            rnstatus["stderr"],
        "timestamp":
            int(time.time()),
        "snapshot": True,
    }


def get_status():
    now = time.time()

    cached = STATUS_CACHE["data"]
    age = now - STATUS_CACHE["updated"]

    # Fast path: return recent snapshot immediately.
    if cached is not None and age < STATUS_CACHE_TTL:
        result = dict(cached)

        result["uptime_seconds"] = int(
            time.time() - START_TIME
        )

        result["cache_age_seconds"] = round(
            age, 2
        )

        result["cached"] = True

        return result

    try:
        fresh = build_status_snapshot()

        STATUS_CACHE["data"] = fresh
        STATUS_CACHE["updated"] = time.time()

        result = dict(fresh)
        result["cache_age_seconds"] = 0
        result["cached"] = False

        return result

    except Exception as exc:

        # Never destroy the dashboard just because a
        # diagnostic refresh failed.
        if cached is not None:
            result = dict(cached)

            result["uptime_seconds"] = int(
                time.time() - START_TIME
            )

            result["cache_age_seconds"] = round(
                age, 2
            )

            result["cached"] = True
            result["stale"] = True
            result["snapshot_error"] = str(exc)

            return result

        return {
            "service": "reticulum",
            "online": False,
            "uptime_seconds": int(
                time.time() - START_TIME
            ),
            "version": "",
            "shared_instance": {},
            "interfaces": [],
            "rnstatus": "",
            "error": str(exc),
            "timestamp": int(time.time()),
            "snapshot": True,
            "cached": False,
            "stale": True,
        }


def get_lxmf_outbox():
    path = Path(
        "/config/reticulum/homeassistant-node/"
        "lxmf-outbox.json"
    )

    try:
        if not path.exists():
            messages = []
        else:
            messages = json.loads(
                path.read_text(encoding="utf-8")
            )

        if not isinstance(messages, list):
            messages = []

        return {
            "ok": True,
            "count": len(messages),
            "messages": messages,
        }

    except Exception as exc:
        return {
            "ok": False,
            "count": 0,
            "messages": [],
            "error": str(exc),
        }




def messenger_contact_uri(destination_hash, display_name=""):
    destination_hash = str(
        destination_hash or ""
    ).strip().lower()

    display_name = str(
        display_name or ""
    ).strip()

    if len(destination_hash) != 32:
        raise ValueError(
            "Ungültiger LXMF Destination Hash"
        )

    try:
        bytes.fromhex(destination_hash)
    except Exception:
        raise ValueError(
            "Destination Hash ist nicht hexadezimal"
        )

    query = urllib.parse.urlencode({
        "name": display_name
    })

    return (
        "reticulum://lxmf/" +
        destination_hash +
        ("?" + query if display_name else "")
    )


def messenger_qr_svg(destination_hash, display_name=""):
    uri = messenger_contact_uri(
        destination_hash,
        display_name,
    )

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=1,
        border=4,
    )

    qr.add_data(uri)
    qr.make(fit=True)

    matrix = qr.get_matrix()

    size = len(matrix)

    rects = []

    for y, row in enumerate(matrix):
        for x, dark in enumerate(row):
            if dark:
                rects.append(
                    '<rect x="{}" y="{}" width="1" height="1"/>'.format(
                        x,
                        y,
                    )
                )

    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<svg xmlns="http://www.w3.org/2000/svg" '
        'viewBox="0 0 {0} {0}" '
        'shape-rendering="crispEdges">'
        '<rect width="100%" height="100%" fill="#ffffff"/>'
        '<g fill="#000000">'
        '{1}'
        '</g>'
        '</svg>'
    ).format(
        size,
        "".join(rects),
    )

    return svg.encode("utf-8"), uri


N2K_BACKUP_OPTION_KEYS = (
    "messenger_name",
    "auto_interface",
    "internet_bootstrap",
    "tcp_interface",
    "tcp_host",
    "tcp_port",
    "rnode_interface",
    "rnode_port",
    "rnode_frequency",
    "rnode_bandwidth",
    "rnode_txpower",
    "rnode_spreadingfactor",
    "rnode_codingrate",
    "transport",
    "propagation_enabled",
    "propagation_auto_discovery",
    "propagation_node",
    "propagation_auto_sync",
    "propagation_sync_interval",
    "loglevel",
)


def get_propagation_config():
    try:
        options = get_addon_options()
    except Exception:
        options = {}

    state_file = Path(
        "/config/reticulum/homeassistant-node/state.json"
    )

    state = {}

    try:
        if state_file.exists():
            value = json.loads(
                state_file.read_text(
                    encoding="utf-8"
                )
            )

            if isinstance(value, dict):
                state = value

    except Exception:
        state = {}

    return {
        "ok": True,
        "enabled": bool(
            options.get(
                "propagation_enabled",
                False,
            )
        ),
        "auto_discovery": bool(
            options.get(
                "propagation_auto_discovery",
                True,
            )
        ),
        "node": str(
            options.get(
                "propagation_node",
                "",
            )
            or ""
        ).strip().lower(),
        "auto_sync": bool(
            options.get(
                "propagation_auto_sync",
                True,
            )
        ),
        "sync_interval": int(
            options.get(
                "propagation_sync_interval",
                900,
            )
            or 900
        ),
        "runtime_enabled": bool(
            state.get(
                "lxmf_propagation_enabled",
                False,
            )
        ),
        "runtime_auto_discovery": bool(
            state.get(
                "lxmf_propagation_auto_discovery",
                False,
            )
        ),
        "runtime_source": str(
            state.get(
                "lxmf_propagation_source",
                "",
            )
            or ""
        ),
        "candidate_count": int(
            state.get(
                "lxmf_propagation_candidates",
                0,
            )
            or 0
        ),
        "selected_hops": int(
            state.get(
                "lxmf_propagation_selected_hops",
                0,
            )
            or 0
        ),
        "runtime_node": str(
            state.get(
                "lxmf_propagation_node",
                "",
            )
            or ""
        ),
        "last_sync": int(
            state.get(
                "lxmf_propagation_last_sync",
                0,
            )
            or 0
        ),
        "sync_result": str(
            state.get(
                "lxmf_propagation_sync_result",
                "",
            )
            or ""
        ),
        "last_probe": int(
            state.get(
                "lxmf_propagation_last_probe",
                0,
            )
            or 0
        ),
        "probe_requests": int(
            state.get(
                "lxmf_propagation_probe_requests",
                0,
            )
            or 0
        ),
        "probe_error": str(
            state.get(
                "lxmf_propagation_probe_error",
                "",
            )
            or ""
        ),
        "announce_total": int(
            state.get(
                "lxmf_propagation_announce_total",
                0,
            )
            or 0
        ),
        "announce_valid": int(
            state.get(
                "lxmf_propagation_announce_valid",
                0,
            )
            or 0
        ),
        "announce_invalid": int(
            state.get(
                "lxmf_propagation_announce_invalid",
                0,
            )
            or 0
        ),
        "announce_inactive": int(
            state.get(
                "lxmf_propagation_announce_inactive",
                0,
            )
            or 0
        ),
        "announce_active": int(
            state.get(
                "lxmf_propagation_announce_active",
                0,
            )
            or 0
        ),
        "announce_persisted": int(
            state.get(
                "lxmf_propagation_announce_persisted",
                0,
            )
            or 0
        ),
        "announce_bad_hash": int(
            state.get(
                "lxmf_propagation_announce_bad_hash",
                0,
            )
            or 0
        ),
        "handler_errors": int(
            state.get(
                "lxmf_propagation_handler_errors",
                0,
            )
            or 0
        ),
        "last_candidate": str(
            state.get(
                "lxmf_propagation_last_candidate",
                "",
            )
            or ""
        ),
        "last_stage": str(
            state.get(
                "lxmf_propagation_last_stage",
                "",
            )
            or ""
        ),
        "last_announce": int(
            state.get(
                "lxmf_propagation_last_announce",
                0,
            )
            or 0
        ),
        "cache_scans": int(
            state.get(
                "lxmf_propagation_cache_scans",
                0,
            )
            or 0
        ),
        "cache_matches": int(
            state.get(
                "lxmf_propagation_cache_matches",
                0,
            )
            or 0
        ),
        "last_cache_scan": int(
            state.get(
                "lxmf_propagation_last_cache_scan",
                0,
            )
            or 0
        ),
        "cache_error": str(
            state.get(
                "lxmf_propagation_cache_error",
                "",
            )
            or ""
        ),
        "discovery_error": str(
            state.get(
                "lxmf_propagation_discovery_error",
                "",
            )
            or ""
        ),
        "error": str(
            state.get(
                "lxmf_propagation_error",
                "",
            )
            or ""
        ),
    }


def get_propagation_candidates():
    path = Path(
        "/config/reticulum/homeassistant-node/propagation-nodes.json"
    )

    now = int(time.time())

    try:
        file_exists = path.exists()

        if file_exists:
            value = json.loads(
                path.read_text(
                    encoding="utf-8"
                )
            )
        else:
            value = []

        if not isinstance(value, list):
            value = []

        candidates = []
        stale_count = 0
        invalid_count = 0
        total_seen = 0
        newest_seen = 0
        raw_count = len(value)
        raw_preview = []

        for item in value:
            if not isinstance(item, dict):
                invalid_count += 1
                if len(raw_preview) < 5:
                    raw_preview.append({
                        "status": "invalid_record",
                        "reason": "Eintrag ist kein Objekt",
                    })
                continue

            peer = str(
                item.get("destination_hash") or ""
            ).strip().lower()

            seen = int(
                item.get("last_seen") or 0
            )

            if not re.fullmatch(
                r"[0-9a-f]{32}",
                peer,
            ):
                invalid_count += 1
                if len(raw_preview) < 5:
                    raw_preview.append({
                        "destination_hash": peer,
                        "status": "rejected",
                        "reason": "destination_hash_not_32_hex",
                    })
                continue

            total_seen += 1
            newest_seen = max(newest_seen, seen)

            if not seen or now - seen > 86400:
                stale_count += 1
                if len(raw_preview) < 5:
                    raw_preview.append({
                        "destination_hash": peer,
                        "status": "rejected",
                        "reason": "stale_or_missing_last_seen",
                        "last_seen": seen,
                    })
                continue

            if len(raw_preview) < 5:
                raw_preview.append({
                    "destination_hash": peer,
                    "status": "candidate",
                    "reason": "accepted",
                    "last_seen": seen,
                    "active": item.get("active") is True,
                    "hops": int(item.get("hops") or 0),
                })

            candidates.append({
                "destination_hash": peer,
                "active": item.get("active") is True,
                "last_seen": seen,
                "age_seconds": max(0, now - seen),
                "hops": int(
                    item.get("hops") or 0
                ),
                "stamp_cost": int(
                    item.get("stamp_cost") or 0
                ),
            })

        candidates.sort(
            key=lambda item: (
                0 if item["active"] else 1,
                item["hops"],
                item["age_seconds"],
                item["stamp_cost"],
            )
        )

        if candidates:
            diagnostic = "reachable_candidates"
        elif stale_count:
            diagnostic = "only_stale_candidates"
        elif total_seen:
            diagnostic = "no_recent_candidates"
        elif file_exists:
            diagnostic = "no_announces_recorded"
        else:
            diagnostic = "discovery_file_missing"

        runtime = get_propagation_config()

        return {
            "ok": True,
            "count": len(candidates),
            "candidates": candidates,
            "raw_count": raw_count,
            "raw_preview": raw_preview,
            "total_seen": total_seen,
            "stale_count": stale_count,
            "invalid_count": invalid_count,
            "newest_seen": newest_seen,
            "file_exists": file_exists,
            "diagnostic": diagnostic,
            "announce_total": runtime.get("announce_total", 0),
            "announce_valid": runtime.get("announce_valid", 0),
            "announce_invalid": runtime.get("announce_invalid", 0),
            "announce_inactive": runtime.get("announce_inactive", 0),
            "announce_active": runtime.get("announce_active", 0),
            "announce_persisted": runtime.get("announce_persisted", 0),
            "announce_bad_hash": runtime.get("announce_bad_hash", 0),
            "handler_errors": runtime.get("handler_errors", 0),
            "last_candidate": runtime.get("last_candidate", ""),
            "last_stage": runtime.get("last_stage", ""),
            "last_announce": runtime.get("last_announce", 0),
            "cache_scans": runtime.get("cache_scans", 0),
            "cache_matches": runtime.get("cache_matches", 0),
            "last_cache_scan": runtime.get("last_cache_scan", 0),
            "probe_requests": runtime.get("probe_requests", 0),
            "last_probe": runtime.get("last_probe", 0),
            "probe_error": runtime.get("probe_error", ""),
            "cache_error": runtime.get("cache_error", ""),
            "discovery_error": runtime.get("discovery_error", ""),
        }

    except Exception as exc:
        return {
            "ok": False,
            "count": 0,
            "candidates": [],
            "raw_count": 0,
            "raw_preview": [],
            "total_seen": 0,
            "stale_count": 0,
            "invalid_count": 0,
            "newest_seen": 0,
            "file_exists": path.exists(),
            "diagnostic": "read_error",
            "error": str(exc),
        }


def save_propagation_config(payload):
    if not isinstance(payload, dict):
        return {
            "ok": False,
            "error": "Ungültige Daten",
        }

    enabled = bool(
        payload.get("enabled", False)
    )

    auto_discovery = bool(
        payload.get(
            "auto_discovery",
            True,
        )
    )

    node = str(
        payload.get("node") or ""
    ).strip().lower()

    auto_sync = bool(
        payload.get("auto_sync", True)
    )

    try:
        interval = int(
            payload.get(
                "sync_interval",
                900,
            )
            or 900
        )
    except Exception:
        interval = 900

    interval = max(
        300,
        min(
            interval,
            86400,
        ),
    )

    if (
        enabled
        and not auto_discovery
        and not re.fullmatch(
            r"[0-9a-f]{32}",
            node,
        )
    ):
        return {
            "ok": False,
            "error": (
                "Im manuellen Modus muss ein "
                "32-stelliger Propagation Node Hash eingetragen sein"
            ),
        }

    if node and not re.fullmatch(
        r"[0-9a-f]{32}",
        node,
    ):
        return {
            "ok": False,
            "error": "Ungültiger Propagation Node Hash",
        }

    try:
        current = get_addon_options()

        current["propagation_enabled"] = enabled
        current["propagation_auto_discovery"] = auto_discovery
        current["propagation_node"] = node
        current["propagation_auto_sync"] = auto_sync
        current["propagation_sync_interval"] = interval

        token = os.environ.get(
            "SUPERVISOR_TOKEN"
        )

        if not token:
            raise RuntimeError(
                "Supervisor API nicht verfügbar"
            )

        body = json.dumps({
            "options": current
        }).encode("utf-8")

        request = urllib.request.Request(
            "http://supervisor/addons/self/options",
            data=body,
            method="POST",
            headers={
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json",
            },
        )

        with urllib.request.urlopen(
            request,
            timeout=10,
        ) as response:
            raw = response.read().decode(
                "utf-8"
            )

        result = json.loads(
            raw or "{}"
        )

        if result.get("result") not in (
            None,
            "ok",
        ):
            raise RuntimeError(
                result.get("message")
                or "Option konnte nicht gespeichert werden"
            )

        restart_scheduled = schedule_addon_restart()

        return {
            "ok": True,
            "enabled": enabled,
            "auto_discovery": auto_discovery,
            "node": node,
            "auto_sync": auto_sync,
            "sync_interval": interval,
            "restart_required": not restart_scheduled,
            "restart_scheduled": restart_scheduled,
        }

    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }


def get_n2k_backup():
    """
    Export the persistent gateway identity, contacts and supported
    add-on options. Message history is intentionally excluded.
    """
    state_dir = Path(
        "/config/reticulum/homeassistant-node"
    )
    identity_file = state_dir / "identity"
    contacts_file = state_dir / "contacts.json"

    if not identity_file.exists():
        return {
            "ok": False,
            "error": "Persistente Identity nicht gefunden",
        }

    try:
        identity_raw = identity_file.read_bytes()

        if not identity_raw:
            raise ValueError("Identity-Datei ist leer")

        contacts = []

        if contacts_file.exists():
            try:
                value = json.loads(
                    contacts_file.read_text(
                        encoding="utf-8"
                    )
                )

                if isinstance(value, list):
                    contacts = value

            except Exception:
                contacts = []

        try:
            current_options = get_addon_options()
        except Exception:
            current_options = {}

        options = {
            key: current_options.get(key)
            for key in N2K_BACKUP_OPTION_KEYS
            if key in current_options
        }

        return {
            "ok": True,
            "format": "n2k-rns-gateway-backup",
            "version": 1,
            "created_at": int(time.time()),
            "product": "N2K RNS Gateway",
            "contains": {
                "identity": True,
                "contacts": len(contacts),
                "settings": len(options),
                "messages": False,
            },
            "identity_b64": base64.b64encode(
                identity_raw
            ).decode("ascii"),
            "contacts": contacts,
            "options": options,
        }

    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }


def restore_n2k_backup(payload):
    """
    Restore persistent identity, contacts and supported add-on options.
    The running Reticulum/LXMF process is not switched live; a manual
    add-on restart is required after a successful restore.
    """
    if not isinstance(payload, dict):
        return {
            "ok": False,
            "error": "Ungültiges Backup",
        }

    if payload.get("format") != "n2k-rns-gateway-backup":
        return {
            "ok": False,
            "error": "Unbekanntes Backup-Format",
        }

    if int(payload.get("version") or 0) != 1:
        return {
            "ok": False,
            "error": "Nicht unterstützte Backup-Version",
        }

    identity_b64 = str(
        payload.get("identity_b64") or ""
    ).strip()

    if not identity_b64:
        return {
            "ok": False,
            "error": "Backup enthält keine Identity",
        }

    try:
        identity_raw = base64.b64decode(
            identity_b64,
            validate=True,
        )
    except Exception:
        return {
            "ok": False,
            "error": "Identity im Backup ist beschädigt",
        }

    if not identity_raw or len(identity_raw) > 16384:
        return {
            "ok": False,
            "error": "Ungültige Identity-Größe",
        }

    contacts = payload.get("contacts") or []

    if not isinstance(contacts, list):
        return {
            "ok": False,
            "error": "Kontaktliste im Backup ist ungültig",
        }

    clean_contacts = []

    for item in contacts[:500]:
        if not isinstance(item, dict):
            continue

        peer = str(
            item.get("destination_hash") or ""
        ).strip().lower()

        if not re.fullmatch(r"[0-9a-f]{32}", peer):
            continue

        clean = dict(item)
        clean["destination_hash"] = peer

        if "display_name" in clean:
            clean["display_name"] = str(
                clean.get("display_name") or ""
            )[:80]

        clean_contacts.append(clean)

    options = payload.get("options") or {}

    if not isinstance(options, dict):
        options = {}

    clean_options = {
        key: options.get(key)
        for key in N2K_BACKUP_OPTION_KEYS
        if key in options
    }

    state_dir = Path(
        "/config/reticulum/homeassistant-node"
    )
    identity_file = state_dir / "identity"
    contacts_file = state_dir / "contacts.json"

    state_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Write identity and contacts atomically.
    identity_tmp = state_dir / "identity.restore.tmp"
    identity_tmp.write_bytes(identity_raw)
    os.replace(identity_tmp, identity_file)

    contacts_tmp = state_dir / "contacts.restore.tmp"
    contacts_tmp.write_text(
        json.dumps(
            clean_contacts,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    os.replace(contacts_tmp, contacts_file)

    options_restored = 0

    if clean_options:
        token = os.environ.get(
            "SUPERVISOR_TOKEN"
        )

        if not token:
            return {
                "ok": True,
                "restart_required": True,
                "contacts_restored": len(clean_contacts),
                "options_restored": 0,
                "warning": (
                    "Identity und Kontakte wurden wiederhergestellt, "
                    "Einstellungen aber nicht: Supervisor-Token fehlt."
                ),
                "message": (
                    "Teilwiederherstellung abgeschlossen. "
                    "Add-on jetzt neu starten."
                ),
            }

        current = get_addon_options()
        merged = dict(current)
        merged.update(clean_options)

        body = json.dumps({
            "options": merged
        }).encode("utf-8")

        request = urllib.request.Request(
            "http://supervisor/addons/self/options",
            data=body,
            method="POST",
            headers={
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json",
            },
        )

        try:
            with urllib.request.urlopen(
                request,
                timeout=5,
            ) as response:
                response.read()

            options_restored = len(clean_options)
            options_warning = None

        except Exception as exc:
            options_warning = (
                "Identity und Kontakte wurden wiederhergestellt, "
                "Einstellungen aber nicht vollständig: " + str(exc)
            )
    else:
        options_warning = None

    return {
        "ok": True,
        "restart_required": True,
        "contacts_restored": len(clean_contacts),
        "options_restored": options_restored,
        "warning": options_warning,
        "message": (
            "Backup wiederhergestellt. "
            "Add-on jetzt neu starten."
        ),
    }


def get_messenger_contacts():
    path = Path(
        "/config/reticulum/homeassistant-node/"
        "contacts.json"
    )

    try:
        if not path.exists():
            contacts = []
        else:
            contacts = json.loads(
                path.read_text(encoding="utf-8")
            )

        if not isinstance(contacts, list):
            contacts = []

        contacts = [
            item for item in contacts
            if isinstance(item, dict)
            and item.get("destination_hash")
        ]

        contacts.sort(
            key=lambda item: int(
                item.get("last_seen") or 0
            ),
            reverse=True,
        )

        return {
            "ok": True,
            "count": len(contacts),
            "contacts": contacts,
        }

    except Exception as exc:
        return {
            "ok": False,
            "count": 0,
            "contacts": [],
            "error": str(exc),
        }



def get_messenger_nearby(since=0, probe=False):
    """
    Return LXMF announce contacts discovered by the always-on
    announce handler and enrich them with the current Reticulum
    path table where available.

    The scanner itself is passive. The node keeps collecting valid
    LXMF announces in contacts.json continuously, so a 30-second UI
    scan no longer loses peers just because they did not re-announce
    inside that exact window.
    """
    try:
        since = max(0, int(since or 0))
    except Exception:
        since = 0

    probe_queued = False
    if probe:
        try:
            request_file = Path(
                "/config/reticulum/homeassistant-node/"
                "nearby-scan.request"
            )
            request_file.parent.mkdir(
                parents=True,
                exist_ok=True,
            )
            tmp = request_file.with_suffix(".tmp")
            tmp.write_text(
                json.dumps({
                    "requested_at": int(time.time()),
                    "source": "messenger-nearby",
                }),
                encoding="utf-8",
            )
            tmp.replace(request_file)
            probe_queued = True
        except Exception:
            probe_queued = False

    contacts_result = get_messenger_contacts()
    contacts = contacts_result.get("contacts", [])
    if not isinstance(contacts, list):
        contacts = []

    network = get_network_snapshot()
    paths = network.get("paths", [])
    if not isinstance(paths, list):
        paths = []

    path_map = {}
    for item in paths:
        if not isinstance(item, dict):
            continue
        destination = str(
            item.get("destination") or ""
        ).strip().lower()
        if destination:
            path_map[destination] = item

    now = int(time.time())
    cache_ttl = 24 * 60 * 60
    nearby = []
    live_count = 0
    cached_count = 0

    for item in contacts:
        if not isinstance(item, dict):
            continue

        # The nearby scanner must only expose contacts that were
        # actually learned from LXMF announces. Manually imported or
        # manually created contacts belong in the normal contact list.
        source = str(
            item.get("source") or ""
        ).strip()

        if source != "lxmf_announce":
            continue

        last_seen = int(item.get("last_seen") or 0)

        if not last_seen:
            continue

        age_seconds = max(0, now - last_seen)

        # Keep a useful rolling cache, like propagation discovery.
        # Older contacts remain in the normal contact list but are not
        # presented as "nearby".
        if age_seconds > cache_ttl:
            continue

        peer = str(
            item.get("destination_hash") or ""
        ).strip().lower()

        if len(peer) != 32:
            continue

        path_info = path_map.get(peer) or {}
        seen_during_scan = bool(
            since and last_seen >= since
        )

        if seen_during_scan:
            live_count += 1
        else:
            cached_count += 1

        nearby.append({
            "destination_hash": peer,
            "display_name": str(
                item.get("display_name") or ""
            ).strip(),
            "identity_hash": str(
                item.get("identity_hash") or ""
            ).strip(),
            "last_seen": last_seen,
            "age_seconds": age_seconds,
            "source": source,
            "hops": path_info.get("hops"),
            "interface": str(
                path_info.get("interface") or ""
            ).strip(),
            "next_hop": str(
                path_info.get("next_hop") or ""
            ).strip(),
            "expires": path_info.get("expires"),
            "path_known": bool(path_info),
            "seen_during_scan": seen_during_scan,
            "discovery_state": (
                "live"
                if seen_during_scan
                else "cached"
            ),
        })

    nearby.sort(
        key=lambda item: (
            0 if item.get("seen_during_scan") else 1,
            -int(item.get("last_seen") or 0),
        )
    )

    node_state = get_node_identity_status()
    if not isinstance(node_state, dict):
        node_state = {}

    return {
        "ok": True,
        "passive": False if probe else True,
        "probe_queued": probe_queued,
        "since": since,
        "timestamp": now,
        "cache_ttl_seconds": cache_ttl,
        "count": len(nearby),
        "live_count": live_count,
        "cached_count": cached_count,
        "contacts": nearby,
        "network_ok": bool(network.get("ok")),
        "rns_path_count": int(
            network.get("path_count") or 0
        ),
        "rns_interfaces_up": int(
            network.get("interfaces_up") or 0
        ),
        "lxmf_cache_candidates": int(
            node_state.get(
                "lxmf_contact_cache_candidates"
            ) or 0
        ),
        "lxmf_cache_matches": int(
            node_state.get(
                "lxmf_contact_cache_matches"
            ) or 0
        ),
        "lxmf_live_announces_total": int(
            node_state.get(
                "lxmf_contact_live_announces"
            ) or 0
        ),
        "lxmf_cache_error": str(
            node_state.get(
                "lxmf_contact_cache_error"
            ) or ""
        ),
        "note": (
            "Nearby means LXMF announces heard on configured "
            "Reticulum interfaces. Live entries were heard during "
            "this scan; cached entries were heard within 24 hours."
        ),
    }

def set_messenger_contact_alias(peer_hash, name):
    peer_hash = str(peer_hash or "").strip()
    name = str(name or "").strip()

    if len(peer_hash) != 32:
        return {
            "ok": False,
            "error": "Ungültiger Peer Hash",
        }

    if len(name) > 40:
        return {
            "ok": False,
            "error": "Alias maximal 40 Zeichen",
        }

    path = Path(
        "/config/reticulum/homeassistant-node/contacts.json"
    )

    try:
        if path.exists():
            contacts = json.loads(
                path.read_text(encoding="utf-8")
            )
        else:
            contacts = []

        if not isinstance(contacts, list):
            contacts = []

        found = False

        for item in contacts:
            if not isinstance(item, dict):
                continue

            if str(
                item.get("destination_hash") or ""
            ).strip() != peer_hash:
                continue

            item["display_name"] = name
            found = True
            break

        if not found:
            contacts.append({
                "destination_hash": peer_hash,
                "display_name": name,
                "last_seen": 0,
            })

        tmp = path.with_suffix(".json.tmp")

        tmp.write_text(
            json.dumps(
                contacts,
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )

        tmp.replace(path)

        return {
            "ok": True,
            "peer_hash": peer_hash,
            "display_name": name,
        }

    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }



MESSENGER_READ_STATE = Path(
    "/config/reticulum/homeassistant-node/read-state.json"
)


def load_messenger_read_state():
    try:
        if not MESSENGER_READ_STATE.exists():
            return {}

        data = json.loads(
            MESSENGER_READ_STATE.read_text(
                encoding="utf-8"
            )
        )

        return data if isinstance(data, dict) else {}

    except Exception:
        return {}


def save_messenger_read_state(data):
    MESSENGER_READ_STATE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    tmp = MESSENGER_READ_STATE.with_suffix(
        ".json.tmp"
    )

    tmp.write_text(
        json.dumps(
            data,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    tmp.replace(MESSENGER_READ_STATE)


def mark_messenger_read(peer):
    peer = str(peer or "").strip()

    if len(peer) != 32:
        return {
            "ok": False,
            "error": "Ungültiger Peer Hash",
        }

    base = Path(
        "/config/reticulum/homeassistant-node"
    )

    inbox_file = base / "lxmf-inbox.json"

    newest = 0

    try:
        if inbox_file.exists():
            inbox = json.loads(
                inbox_file.read_text(
                    encoding="utf-8"
                )
            )

            if isinstance(inbox, list):
                for item in inbox:
                    if not isinstance(item, dict):
                        continue

                    if str(
                        item.get("source_hash") or ""
                    ).strip() != peer:
                        continue

                    timestamp = int(
                        item.get("timestamp")
                        or item.get("received_at")
                        or 0
                    )

                    newest = max(
                        newest,
                        timestamp,
                    )

    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
        }

    state = load_messenger_read_state()

    state[peer] = max(
        int(state.get(peer) or 0),
        newest,
        int(time.time()) if not newest else 0,
    )

    save_messenger_read_state(state)

    return {
        "ok": True,
        "peer_hash": peer,
        "last_read": state[peer],
    }



def get_messenger_data():
    base = Path(
        "/config/reticulum/homeassistant-node"
    )

    inbox_file = base / "lxmf-inbox.json"
    outbox_file = base / "lxmf-outbox.json"
    contacts_file = base / "contacts.json"

    def load_list(path):
        try:
            if not path.exists():
                return []

            data = json.loads(
                path.read_text(encoding="utf-8")
            )

            return data if isinstance(data, list) else []

        except Exception:
            return []

    inbox = load_list(inbox_file)
    outbox = load_list(outbox_file)
    contacts = load_list(contacts_file)
    read_state = load_messenger_read_state()

    contact_names = {}

    for item in contacts:
        if not isinstance(item, dict):
            continue

        peer = str(
            item.get("destination_hash") or ""
        ).strip()

        name = str(
            item.get("display_name") or ""
        ).strip()

        if peer and name:
            contact_names[peer] = name

    conversations = {}

    def conversation(peer):
        if peer not in conversations:
            conversations[peer] = {
                "peer_hash": peer,
                "display_name": (
                    contact_names.get(peer)
                    or (
                        "Kontakt " +
                        peer[:6].upper()
                        if peer
                        else "Unbekannt"
                    )
                ),
                "messages": [],
                "last_timestamp": 0,
                "unread": 0,
            }

        return conversations[peer]

    for item in inbox:

        peer = str(
            item.get("source_hash") or ""
        ).strip()

        if not peer:
            continue

        timestamp = int(
            item.get("timestamp")
            or item.get("received_at")
            or 0
        )

        chat = conversation(peer)

        chat["messages"].append({
            "direction": "in",
            "timestamp": timestamp,
            "content": str(
                item.get("content") or ""
            ),
            "title": str(
                item.get("title") or ""
            ),
            "message_id": str(
                item.get("message_id") or ""
            ),
        })

        chat["last_timestamp"] = max(
            chat["last_timestamp"],
            timestamp,
        )

        last_read = int(
            read_state.get(peer) or 0
        )

        if timestamp > last_read:
            chat["unread"] += 1

    for item in outbox:

        peer = str(
            item.get("destination_hash") or ""
        ).strip()

        if not peer:
            continue

        timestamp = int(
            item.get("timestamp") or 0
        )

        chat = conversation(peer)

        chat["messages"].append({
            "direction": "out",
            "timestamp": timestamp,
            "content": str(
                item.get("content") or ""
            ),
            "title": str(
                item.get("title") or ""
            ),
            "message_id": str(
                item.get("message_id") or ""
            ),
            "delivery_status": str(
                item.get("delivery_status")
                or "queued"
            ),
            "delivery_method": str(
                item.get("delivery_method")
                or "direct"
            ),
            "propagation_node": str(
                item.get("propagation_node")
                or ""
            ),
            "delivery_updated_at": int(
                item.get("delivery_updated_at")
                or 0
            ),
            "delivered_at": int(
                item.get("delivered_at")
                or 0
            ),
            "delivery_error": str(
                item.get("delivery_error")
                or ""
            ),
        })

        chat["last_timestamp"] = max(
            chat["last_timestamp"],
            timestamp,
        )

    result = list(conversations.values())

    for chat in result:
        chat["messages"].sort(
            key=lambda x: x["timestamp"]
        )

        if chat["messages"]:
            last = chat["messages"][-1]
            chat["last_message"] = (
                last.get("content") or ""
            )
        else:
            chat["last_message"] = ""

    result.sort(
        key=lambda x: x["last_timestamp"],
        reverse=True,
    )

    return {
        "ok": True,
        "count": len(result),
        "conversations": result,
    }



# ---------------------------------------------------------
# Home Assistant Core bridge
# ---------------------------------------------------------

HA_API_BASE = "http://supervisor/core/api"
HA_PUBLISH_INTERVAL = 15


def publish_home_assistant_state(
    entity_id,
    state,
    attributes=None
):
    token = os.environ.get("SUPERVISOR_TOKEN")

    if not token:
        raise RuntimeError(
            "SUPERVISOR_TOKEN nicht vorhanden"
        )

    body = json.dumps({
        "state": str(state),
        "attributes": attributes or {},
    }).encode("utf-8")

    request = urllib.request.Request(
        HA_API_BASE + "/states/" + entity_id,
        data=body,
        method="POST",
        headers={
            "Authorization":
                "Bearer " + token,
            "Content-Type":
                "application/json",
        },
    )

    with urllib.request.urlopen(
        request,
        timeout=5
    ) as response:
        return response.status in (200, 201)


def publish_reticulum_status_to_home_assistant():

    status = get_status()

    interfaces = (
        status.get("interfaces") or []
    )

    internet = (
        status.get("internet_health") or {}
    )

    state = (
        "online"
        if status.get("online")
        else "offline"
    )

    attributes = {
        "friendly_name":
            "Reticulum Status",

        "icon":
            "mdi:radio-tower",

        "service":
            "reticulum",

        "uptime_seconds":
            status.get(
                "uptime_seconds",
                0
            ),

        "version":
            status.get(
                "version",
                ""
            ),

        "interface_count":
            len(interfaces),

        "internet_path_state":
            internet.get(
                "path_state",
                "UNKNOWN"
            ),

        "internet_peer_count":
            internet.get(
                "peer_count",
                0
            ),

        "source":
            "reticulum_dev",
    }

    return publish_home_assistant_state(
        "sensor.reticulum_status",
        state,
        attributes,
    )


def home_assistant_publisher_loop():

    while True:

        try:
            publish_reticulum_status_to_home_assistant()

            publish_mcp_snapshots()

            print(
                "[HA] sensor.reticulum_status published",
                flush=True
            )

            print(
                "[MCP] shared snapshots published",
                flush=True
            )

        except Exception as exc:

            print(
                "[HA] publish failed: "
                + str(exc),
                flush=True
            )

        time.sleep(
            HA_PUBLISH_INTERVAL
        )



def get_ha_bridge_diagnostic():
    """Inspect the Reticulum integration copied into Home Assistant config."""

    import hashlib

    path = Path(
        "/homeassistant/custom_components/"
        "reticulum/__init__.py"
    )

    if not path.exists():
        return {
            "ok": False,
            "exists": False,
            "path": str(path),
        }

    raw = path.read_bytes()
    text = raw.decode(
        "utf-8",
        errors="replace",
    )

    return {
        "ok": True,
        "exists": True,
        "path": str(path),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "has_get_status": "reticulum__GetStatus" in text,
        "has_get_identity": "reticulum__GetIdentity" in text,
        "has_get_contacts": "reticulum__GetContacts" in text,
        "has_get_messages": "reticulum__GetMessages" in text,
        "has_send": "reticulum__SendReticulumMessage" in text,
        "has_095_marker": "Reticulum 0.95.0-dev" in text,
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



    def send_svg(self, payload, status=200):
        if isinstance(payload, str):
            payload = payload.encode("utf-8")

        self.send_response(status)

        self.send_header(
            "Content-Type",
            "image/svg+xml; charset=utf-8",
        )

        self.send_header(
            "Content-Length",
            str(len(payload)),
        )

        self.send_header(
            "Cache-Control",
            "no-store",
        )

        self.end_headers()
        self.wfile.write(payload)


    def do_POST(self):
        path = self.path.rstrip("/")

        if path.endswith("/api/messenger/qr"):
            try:
                length = int(
                    self.headers.get("Content-Length", "0")
                )
                raw = self.rfile.read(length)
                payload = json.loads(
                    raw.decode("utf-8") or "{}"
                )

                peer = str(
                    payload.get("peer", "")
                ).strip()

                name = str(
                    payload.get("name", "")
                ).strip()

                svg, _ = messenger_qr_svg(
                    peer,
                    name,
                )

                self.send_svg(svg)

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return

        if path.endswith("/api/node/announce"):
            self.send_json(request_node_announce())
            return

        if path.endswith("/api/node/lxmf/send"):
            try:
                length = int(
                    self.headers.get("Content-Length", "0")
                )
                raw = self.rfile.read(length)
                payload = json.loads(raw.decode("utf-8"))

                destination_hash = str(
                    payload.get("destination_hash", "")
                ).strip()

                content = str(
                    payload.get("content", "")
                ).strip()

                title = str(
                    payload.get("title", "")
                ).strip()

                if len(destination_hash) != 32:
                    raise ValueError(
                        "Ungültiger LXMF Destination Hash"
                    )

                if not content:
                    raise ValueError(
                        "Nachricht darf nicht leer sein"
                    )

                photo_prefix = "N2KPHOTO/1|image/jpeg|"

                if content.startswith(photo_prefix):
                    photo_b64 = content[len(photo_prefix):]

                    # Mesh Photo v1 is intentionally small. This also
                    # prevents oversized data-URI payloads from filling
                    # the local inbox/outbox JSON stores.
                    if len(photo_b64) > 40000:
                        raise ValueError(
                            "Mesh-Foto ist zu groß"
                        )

                    if not re.fullmatch(
                        r"[A-Za-z0-9+/]+={0,2}",
                        photo_b64,
                    ):
                        raise ValueError(
                            "Ungültiges Mesh-Foto"
                        )

                request_file = Path(
                    "/homeassistant/reticulum_bridge/"
                    "lxmf_outbound.json"
                )

                request_file.parent.mkdir(
                    parents=True,
                    exist_ok=True,
                )

                request_file.write_text(
                    json.dumps({
                        "request_id": uuid.uuid4().hex,
                        "destination_hash": destination_hash,
                        "content": content,
                        "title": title,
                        "requested_at": int(time.time()),
                    }),
                    encoding="utf-8",
                )

                self.send_json({
                    "ok": True,
                    "state": "QUEUED",
                })

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return

        if path.endswith("/api/node/lxmf/announce"):
            self.send_json(request_lxmf_announce())
            return

        if path.endswith("/api/propagation/candidates"):
            self.send_json(
                get_propagation_candidates()
            )
            return

        if path.endswith("/api/propagation"):
            try:
                length = int(
                    self.headers.get(
                        "Content-Length",
                        "0",
                    )
                )

                if length <= 0 or length > 16384:
                    raise ValueError(
                        "Ungültige Anfrage"
                    )

                raw = self.rfile.read(length)
                payload = json.loads(
                    raw.decode("utf-8")
                )

                result = save_propagation_config(
                    payload
                )

                self.send_json(
                    result,
                    200 if result.get("ok") else 400,
                )

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return

        if path.endswith("/api/backup/restore"):
            try:
                length = int(
                    self.headers.get(
                        "Content-Length",
                        "0",
                    )
                )

                if length <= 0 or length > 1024 * 1024:
                    raise ValueError(
                        "Ungültige Backup-Größe"
                    )

                raw = self.rfile.read(length)
                payload = json.loads(
                    raw.decode("utf-8")
                )

                result = restore_n2k_backup(
                    payload
                )

                self.send_json(
                    result,
                    200 if result.get("ok") else 400,
                )

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return

        if path.endswith("/api/messenger/contact"):
            try:
                length = int(
                    self.headers.get(
                        "Content-Length",
                        "0",
                    )
                )

                raw = self.rfile.read(length)

                payload = json.loads(
                    raw.decode("utf-8")
                )

                result = set_messenger_contact_alias(
                    payload.get("peer_hash"),
                    payload.get("name"),
                )

                self.send_json(
                    result,
                    200 if result.get("ok") else 400,
                )

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return

        if path.endswith("/api/messenger/read"):
            try:
                length = int(
                    self.headers.get(
                        "Content-Length",
                        "0",
                    )
                )

                raw = self.rfile.read(length)

                payload = json.loads(
                    raw.decode("utf-8")
                )

                result = mark_messenger_read(
                    payload.get("peer_hash")
                )

                self.send_json(
                    result,
                    200 if result.get("ok") else 400,
                )

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return

        if path.endswith("/api/messenger/profile"):
            try:
                length = int(
                    self.headers.get(
                        "Content-Length",
                        "0",
                    )
                )

                raw = self.rfile.read(length)

                payload = json.loads(
                    raw.decode("utf-8")
                )

                self.send_json(
                    update_messenger_profile(
                        payload.get("name")
                    )
                )

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return


        path = self.path.split("?", 1)[0]

        if path.endswith("/api/rnode/select"):
            import os
            import urllib.request

            try:
                length = int(self.headers.get("Content-Length", "0"))
                raw = self.rfile.read(length)
                payload = json.loads(raw.decode("utf-8"))

                port = str(payload.get("port", "")).strip()

                # Nur tatsächlich erkannte Serial-Ports akzeptieren.
                devices = get_serial_devices()
                allowed = {d["path"] for d in devices}

                if not port:
                    self.send_json({
                        "ok": False,
                        "error": "Kein Port angegeben"
                    }, 400)
                    return

                if port not in allowed:
                    self.send_json({
                        "ok": False,
                        "error": "Port wurde nicht als Serial-Gerät erkannt"
                    }, 400)
                    return

                token = os.environ.get("SUPERVISOR_TOKEN")

                if not token:
                    self.send_json({
                        "ok": False,
                        "error": "SUPERVISOR_TOKEN nicht vorhanden"
                    }, 503)
                    return

                # Aktuelle Add-on-Optionen lesen.
                request = urllib.request.Request(
                    "http://supervisor/addons/self/info",
                    headers={
                        "Authorization": "Bearer " + token
                    },
                )

                with urllib.request.urlopen(request, timeout=5) as response:
                    info = json.loads(response.read().decode("utf-8"))

                # Supervisor responses wrap add-on information in "data".
                addon_info = info.get("data") or {}
                options = dict(addon_info.get("options") or {})

                if not options:
                    raise RuntimeError(
                        "Supervisor lieferte keine Add-on-Optionen"
                    )

                options["rnode_port"] = port

                # Nur rnode_port ändern; bestehende Optionen bleiben erhalten.
                body = json.dumps({
                    "options": options
                }).encode("utf-8")

                request = urllib.request.Request(
                    "http://supervisor/addons/self/options",
                    data=body,
                    method="POST",
                    headers={
                        "Authorization": "Bearer " + token,
                        "Content-Type": "application/json",
                    },
                )

                with urllib.request.urlopen(request, timeout=5) as response:
                    result = response.read().decode("utf-8")

                self.send_json({
                    "ok": True,
                    "port": port,
                    "rnode_interface": options.get("rnode_interface", False),
                    "supervisor_response": result[:200]
                })
                return

            except Exception as exc:
                error_text = str(exc)

                # urllib HTTP errors may contain the Supervisor's
                # actual JSON error response in the response body.
                try:
                    if hasattr(exc, "read"):
                        body = exc.read().decode("utf-8", errors="replace")
                        if body:
                            error_text = error_text + " | " + body
                except Exception:
                    pass

                self.send_json({
                    "ok": False,
                    "error": error_text
                }, 500)
                return

        self.send_json({
            "ok": False,
            "error": "Unknown POST endpoint"
        }, 404)

    def do_GET(self):

        path = self.path.split("?", 1)[0]

        # Home Assistant Ingress can prepend a dynamic
        # path prefix. Match endpoints by suffix.

        if path.endswith("/api/bridge/diagnostic"):
            self.send_json(
                get_ha_bridge_diagnostic()
            )
            return

        if path.endswith("/health"):
            self.send_json({
                "status": "ok"
            })
            return

        if path.endswith("/api/support/diagnostic"):
            self.send_json(
                get_n2k_support_diagnostic()
            )
            return

        if path.endswith("/api/selftest"):
            self.send_json(get_n2k_selftest())
            return

        if path.endswith("/api/status"):
            self.send_json(get_status())
            return

        if path.endswith("/api/node/identity"):
            self.send_json(get_node_identity_status())
            return

        if path.endswith("/api/node/lxmf/outbox"):
            self.send_json(get_lxmf_outbox())
            return

        if path.endswith("/api/messenger/qr"):
            try:
                parsed = urllib.parse.urlsplit(
                    self.path
                )

                params = urllib.parse.parse_qs(
                    parsed.query
                )

                peer = str(
                    (
                        params.get("peer")
                        or [""]
                    )[0]
                ).strip()

                name = str(
                    (
                        params.get("name")
                        or [""]
                    )[0]
                ).strip()

                svg, _ = messenger_qr_svg(
                    peer,
                    name,
                )

                self.send_svg(svg)

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return

        if path.endswith("/api/messenger/nearby"):
            try:
                parsed = urllib.parse.urlsplit(
                    self.path
                )
                params = urllib.parse.parse_qs(
                    parsed.query
                )
                since = (
                    params.get("since")
                    or ["0"]
                )[0]
                probe = str(
                    (
                        params.get("probe")
                        or ["0"]
                    )[0]
                ).strip().lower() in (
                    "1", "true", "yes", "on"
                )

                self.send_json(
                    get_messenger_nearby(
                        since,
                        probe=probe,
                    )
                )

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc),
                }, 400)

            return

        if path.endswith("/api/propagation/candidates"):
            self.send_json(
                get_propagation_candidates()
            )
            return

        if path.endswith("/api/propagation"):
            self.send_json(
                get_propagation_config()
            )
            return

        if path.endswith("/api/backup"):
            result = get_n2k_backup()

            self.send_json(
                result,
                200 if result.get("ok") else 500,
            )
            return

        if path.endswith("/api/messenger/contacts"):
            self.send_json(get_messenger_contacts())
            return

        if path.endswith("/api/messenger"):
            self.send_json(get_messenger_data())
            return

        if path.endswith("/api/node/lxmf/inbox"):
            self.send_json(get_lxmf_inbox())
            return


        if path.endswith("/api/network"):
            self.send_json(get_network_snapshot())
            return

        if path.endswith("/api/internet/diagnostic"):
            self.send_json(get_internet_diagnostic())
            return

        if path.endswith("/api/internet/discovery"):
            self.send_json(get_reticulum_discovery())
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
        if path.endswith("/api/rnode/config"):
            try:
                options = get_addon_options()
                status = get_status()

                interfaces = (
                    status.get("interfaces", [])
                    if isinstance(status, dict)
                    else []
                )

                live_rnode = next(
                    (
                        item for item in interfaces
                        if isinstance(item, dict)
                        and (
                            str(item.get("type", "")).lower()
                            == "rnodeinterface"
                            or "rnode" in str(
                                item.get("name", "")
                            ).lower()
                        )
                    ),
                    None,
                )

                self.send_json({
                    "ok": True,
                    "rnode_interface": options.get(
                        "rnode_interface", False
                    ),
                    "rnode_port": options.get(
                        "rnode_port", ""
                    ),
                    "rnode_frequency": options.get(
                        "rnode_frequency", 0
                    ),
                    "rnode_bandwidth": options.get(
                        "rnode_bandwidth", 125000
                    ),
                    "rnode_txpower": options.get(
                        "rnode_txpower", 0
                    ),
                    "rnode_spreadingfactor": options.get(
                        "rnode_spreadingfactor", 8
                    ),
                    "rnode_codingrate": options.get(
                        "rnode_codingrate", 5
                    ),
                    "live": live_rnode,
                })
                return

            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "error": str(exc)
                }, 500)
                return

        if path.endswith("/api/supervisor"):
            import os
            import urllib.request

            token_present = bool(os.environ.get("SUPERVISOR_TOKEN"))

            result = {
                "token_present": token_present,
                "api_reachable": False,
            }

            if token_present:
                try:
                    request = urllib.request.Request(
                        "http://supervisor/info",
                        headers={
                            "Authorization":
                            "Bearer " + os.environ["SUPERVISOR_TOKEN"]
                        },
                    )

                    with urllib.request.urlopen(request, timeout=3) as response:
                        result["api_reachable"] = response.status == 200

                except Exception as exc:
                    result["error"] = str(exc)

            self.send_json(result)
            return


        if path.endswith("/api/rnode/detect"):
            devices = get_serial_devices()

            try:
                options = get_addon_options()
                saved_port = str(
                    options.get("rnode_port", "")
                ).strip()
            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "state": "CONFIG_ERROR",
                    "error": str(exc)
                }, 500)
                return

            if not devices:
                self.send_json({
                    "ok": True,
                    "state": "NO_SERIAL",
                    "serial_count": 0,
                    "saved_port": saved_port
                })
                return

            available = {
                device["path"]: device
                for device in devices
            }

            if saved_port:
                if saved_port not in available:
                    self.send_json({
                        "ok": True,
                        "state": "SAVED_PORT_MISSING",
                        "serial_count": len(devices),
                        "saved_port": saved_port,
                        "serial_devices": devices
                    })
                    return

                port = saved_port
                source = "saved"
            else:
                if len(devices) > 1:
                    self.send_json({
                        "ok": True,
                        "state": "MULTIPLE_SERIAL",
                        "serial_count": len(devices),
                        "serial_devices": devices
                    })
                    return

                port = devices[0]["path"]
                source = "detected"

            self.send_json({
                "ok": True,
                "state": "SERIAL_READY",
                "compatibility": "NOT_TESTED",
                "serial_count": len(devices),
                "port": port,
                "port_source": source,
                "saved_port": saved_port
            })
            return

        if path.endswith("/api/rnode/inspect"):
            devices = get_serial_devices()

            try:
                options = get_addon_options()
                saved_port = str(
                    options.get("rnode_port", "")
                ).strip()
            except Exception as exc:
                self.send_json({
                    "ok": False,
                    "state": "CONFIG_ERROR",
                    "error": str(exc)
                }, 500)
                return

            if not saved_port:
                self.send_json({
                    "ok": False,
                    "state": "NO_SAVED_PORT",
                    "serial_devices": devices,
                    "error": "Kein RNode-Port gespeichert"
                }, 409)
                return

            available = {
                device["path"]: device
                for device in devices
            }

            if saved_port not in available:
                self.send_json({
                    "ok": False,
                    "state": "SAVED_PORT_MISSING",
                    "port": saved_port,
                    "serial_devices": devices
                }, 409)
                return

            report = inspect_rnode(saved_port)
            report["port_source"] = "saved"

            self.send_json(report)
            return

        if path.endswith("/api/rnode/probe"):
            devices = get_serial_devices()

            try:
                options = get_addon_options()
                saved_port = options.get("rnode_port") or ""
            except Exception as exc:
                self.send_json({
                    "detected": False,
                    "result": "CONFIG_ERROR",
                    "error": str(exc)
                }, 500)
                return

            available = {
                device["path"]: device
                for device in devices
            }

            if saved_port:
                if saved_port not in available:
                    self.send_json({
                        "detected": False,
                        "result": "SAVED_PORT_MISSING",
                        "port": saved_port,
                        "serial_devices": devices
                    }, 409)
                    return

                port = saved_port
                port_source = "saved"

            else:
                if len(devices) == 0:
                    self.send_json({
                        "detected": False,
                        "result": "NO_SERIAL",
                        "error": "No serial device found"
                    }, 404)
                    return

                if len(devices) > 1:
                    self.send_json({
                        "detected": False,
                        "result": "MULTIPLE_SERIAL",
                        "error": "Multiple serial devices found",
                        "serial_devices": devices
                    }, 409)
                    return

                port = devices[0]["path"]
                port_source = "detected"

            result = probe_rnode(port)
            result["port"] = port
            result["port_source"] = port_source

            self.send_json(result)
            return

        # STATIC_ASSET_097
        if path.startswith("/static/"):
            rel = path[len("/static/"):]

            if ".." in rel:
                self.send_error(403)
                return

            asset = STATIC_DIR / rel

            if not asset.is_file():
                self.send_error(404)
                return

            suffix = asset.suffix.lower()

            content_types = {
                ".css": "text/css; charset=utf-8",
                ".js": "application/javascript; charset=utf-8",
                ".json": "application/json; charset=utf-8",
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
            }

            payload = asset.read_bytes()

            self.send_response(200)
            self.send_header(
                "Content-Type",
                content_types.get(
                    suffix,
                    "application/octet-stream",
                ),
            )
            self.send_header(
                "Content-Length",
                str(len(payload)),
            )
            self.send_header(
                "Cache-Control",
                "no-store",
            )
            self.end_headers()
            self.wfile.write(payload)
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

            html = index.read_text(
                encoding="utf-8"
            )

            try:
                bootstrap_status = get_status()

                bootstrap_json = json.dumps(
                    bootstrap_status,
                    ensure_ascii=False
                )

                # Prevent accidental script termination
                # from data contained in JSON.
                bootstrap_json = bootstrap_json.replace(
                    "</",
                    "<\\/"
                )

            except Exception as exc:
                bootstrap_json = json.dumps({
                    "service": "reticulum",
                    "online": False,
                    "interfaces": [],
                    "shared_instance": {},
                    "error": str(exc),
                    "bootstrap_error": True,
                })

            marker = (
                '<script id="reticulum-bootstrap-data" '
                'type="application/json">'
                + bootstrap_json +
                '</script>'
            )

            if "</head>" in html:
                html = html.replace(
                    "</head>",
                    marker + "\n</head>",
                    1
                )
            else:
                html = marker + "\n" + html

            payload = html.encode("utf-8")

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

    publisher = threading.Thread(
        target=home_assistant_publisher_loop,
        name="ha-reticulum-publisher",
        daemon=True,
    )
    publisher.start()

    server = ThreadingHTTPServer(
        (HOST, PORT),
        Handler
    )

    server.serve_forever()


if __name__ == "__main__":
    main()
