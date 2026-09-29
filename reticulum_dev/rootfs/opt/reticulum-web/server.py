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
            timeout=5,
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
            "info": "Serial device present, but no RNode response",
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


    def do_POST(self):
        path = self.path.rstrip("/")

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

        if path.endswith("/health"):
            self.send_json({
                "status": "ok"
            })
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
