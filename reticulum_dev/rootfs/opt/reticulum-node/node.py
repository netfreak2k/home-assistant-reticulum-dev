#!/usr/bin/env python3

import json
import os
import signal
import sys
import time
from pathlib import Path

import RNS
import LXMF

CONFIG_DIR = "/config/reticulum"
STATE_DIR = Path(CONFIG_DIR) / "homeassistant-node"
IDENTITY_FILE = STATE_DIR / "identity"
STATE_FILE = STATE_DIR / "state.json"
ANNOUNCE_REQUEST = STATE_DIR / "announce.request"
LXMF_ANNOUNCE_REQUEST = STATE_DIR / "lxmf-announce.request"
ANNOUNCE_COOLDOWN = 60
LXMF_DISPLAY_NAME = "Home Assistant"

APP_NAME = "homeassistant"
ASPECT = "node"

running = True


def stop_handler(signum, frame):
    global running
    running = False


signal.signal(signal.SIGTERM, stop_handler)
signal.signal(signal.SIGINT, stop_handler)


def write_state(data):
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(data, indent=2, sort_keys=True)
    )
    os.replace(tmp, STATE_FILE)


def identity_hex(identity):
    value = getattr(identity, "hash", b"")

    if isinstance(value, bytes):
        return value.hex()

    return str(value)


def destination_hex(destination):
    value = getattr(destination, "hash", b"")

    if isinstance(value, bytes):
        return value.hex()

    return str(value)


STATE_DIR.mkdir(parents=True, exist_ok=True)

# Connect to the already-running shared RNS instance.
reticulum = RNS.Reticulum(
    configdir=CONFIG_DIR,
    loglevel=RNS.LOG_NOTICE,
)

created = False

if IDENTITY_FILE.exists():
    identity = RNS.Identity.from_file(str(IDENTITY_FILE))

    if identity is None:
        raise RuntimeError(
            "Persisted Reticulum identity could not be loaded"
        )
else:
    identity = RNS.Identity()
    identity.to_file(str(IDENTITY_FILE))
    created = True

destination = RNS.Destination(
    identity,
    RNS.Destination.IN,
    RNS.Destination.SINGLE,
    APP_NAME,
    ASPECT,
)


lxmf_storage = STATE_DIR / "lxmf"
lxmf_storage.mkdir(parents=True, exist_ok=True)

lxmf_router = LXMF.LXMRouter(
    identity=identity,
    storagepath=str(lxmf_storage),
    name="Home Assistant",
)

lxmf_destination = lxmf_router.register_delivery_identity(
    identity=identity,
    display_name=LXMF_DISPLAY_NAME,
)

state = {
    "ok": True,
    "service": "homeassistant-reticulum-node",
    "app_name": APP_NAME,
    "aspect": ASPECT,
    "identity_hash": identity_hex(identity),
    "destination_hash": destination_hex(destination),
    "identity_created": created,
    "identity_file": str(IDENTITY_FILE),
    "announce_mode": "manual",
    "announced": False,
    "last_announce": None,
    "lxmf_display_name": LXMF_DISPLAY_NAME,
    "lxmf_destination_hash": lxmf_destination.hash.hex(),
    "lxmf_announced": False,
    "lxmf_last_announce": None,
    "lxmf_announce_result": None,
    "started": int(time.time()),
    "updated": int(time.time()),
}

write_state(state)

while running:
    now = int(time.time())

    if LXMF_ANNOUNCE_REQUEST.exists():
        try:
            request = json.loads(
                LXMF_ANNOUNCE_REQUEST.read_text() or "{}"
            )
        except Exception:
            request = {}

        try:
            LXMF_ANNOUNCE_REQUEST.unlink()
        except FileNotFoundError:
            pass

        requested_at = int(
            request.get("requested_at", now) or now
        )

        last = int(
            state.get("lxmf_last_announce") or 0
        )

        if last and now-last < ANNOUNCE_COOLDOWN:
            state["lxmf_announce_result"] = "COOLDOWN"
        else:
            try:
                lxmf_router.announce(
                    lxmf_destination.hash
                )
                state["lxmf_announced"] = True
                state["lxmf_last_announce"] = now
                state["lxmf_announce_result"] = "SENT"
                state["lxmf_announce_error"] = None
                state["lxmf_announce_requested_at"] = requested_at
            except Exception as exc:
                state["lxmf_announce_result"] = "ERROR"
                state["lxmf_announce_error"] = str(exc)

    if ANNOUNCE_REQUEST.exists():
        try:
            request = json.loads(
                ANNOUNCE_REQUEST.read_text() or "{}"
            )
        except Exception:
            request = {}

        try:
            ANNOUNCE_REQUEST.unlink()
        except FileNotFoundError:
            pass

        requested_at = int(
            request.get("requested_at", now) or now
        )

        last = int(state.get("last_announce") or 0)

        if last and now - last < ANNOUNCE_COOLDOWN:
            state["announce_result"] = "COOLDOWN"
            state["announce_error"] = None
            state["announce_requested_at"] = requested_at
        else:
            try:
                destination.announce()

                state["announced"] = True
                state["last_announce"] = now
                state["announce_requested_at"] = requested_at
                state["announce_result"] = "SENT"
                state["announce_error"] = None

            except Exception as exc:
                state["announce_result"] = "ERROR"
                state["announce_error"] = str(exc)
                state["announce_requested_at"] = requested_at

    state["updated"] = now
    write_state(state)
    time.sleep(2)

state["ok"] = False
state["updated"] = int(time.time())
write_state(state)
