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

OUTBOUND_REQUEST = STATE_DIR / "lxmf_outbound.json"


LXMF_OUTBOX_FILE = STATE_DIR / "lxmf-outbox.json"
LXMF_OUTBOX_LIMIT = 100


def append_lxmf_outbox(message):
    try:
        if LXMF_OUTBOX_FILE.exists():
            data = json.loads(
                LXMF_OUTBOX_FILE.read_text()
            )
        else:
            data = []

        if not isinstance(data, list):
            data = []

        data.append(message)
        data = data[-LXMF_OUTBOX_LIMIT:]

        tmp = Path(str(LXMF_OUTBOX_FILE) + ".tmp")

        tmp.write_text(
            json.dumps(
                data,
                ensure_ascii=False,
                indent=2,
            )
        )

        tmp.replace(LXMF_OUTBOX_FILE)

    except Exception as exc:
        RNS.log(
            "LXMF outbox history error: " + str(exc),
            RNS.LOG_ERROR,
        )


def send_lxmf_message(destination_hash, content, title="", state=None):
    recipient_hash = bytes.fromhex(destination_hash)

    if state is not None:
        state["lxmf_outbound_stage"] = "REQUESTED"
        state["lxmf_outbound_target"] = destination_hash
        state["lxmf_outbound_error"] = None
        state["updated"] = int(time.time())
        write_state(state)

    if len(recipient_hash) != RNS.Identity.TRUNCATED_HASHLENGTH // 8:
        raise ValueError("Ungültiger LXMF Destination Hash")

    # Für verschlüsselte SINGLE-Destinations benötigen wir
    # die öffentliche Identity des Empfängers.
    if state is not None:
        state["lxmf_outbound_stage"] = "PATH"
        state["lxmf_outbound_path"] = bool(
            RNS.Transport.has_path(recipient_hash)
        )
        state["updated"] = int(time.time())
        write_state(state)

    if not RNS.Transport.has_path(recipient_hash):
        if state is not None:
            state["lxmf_outbound_path_request"] = "SENT"
            state["lxmf_outbound_path_requested_at"] = int(time.time())
            state["updated"] = int(time.time())
            write_state(state)

        RNS.Transport.request_path(recipient_hash)

        timeout = time.time() + 15

        while (
            not RNS.Transport.has_path(recipient_hash)
            and time.time() < timeout
        ):
            time.sleep(0.25)

    if not RNS.Transport.has_path(recipient_hash):
        if state is not None:
            state["lxmf_outbound_stage"] = "PATH"
            state["lxmf_outbound_path"] = False
            state["lxmf_outbound_result"] = "NO_PATH"
            state["updated"] = int(time.time())
            write_state(state)

        raise RuntimeError(
            "Kein Reticulum-Pfad zum Empfänger nach 15 Sekunden"
        )

    if state is not None:
        state["lxmf_outbound_path"] = True
        state["lxmf_outbound_stage"] = "IDENTITY"
        state["updated"] = int(time.time())
        write_state(state)

    recipient_identity = RNS.Identity.recall(recipient_hash)

    if state is not None:
        state["lxmf_outbound_identity"] = (
            recipient_identity is not None
        )
        state["updated"] = int(time.time())
        write_state(state)

    if recipient_identity is None:
        raise RuntimeError(
            "Empfänger-Identity nicht aus Announce bekannt"
        )

    destination = RNS.Destination(
        recipient_identity,
        RNS.Destination.OUT,
        RNS.Destination.SINGLE,
        "lxmf",
        "delivery",
    )

    # Sicherheitscheck: Der rekonstruierte LXMF-Zielhash
    # muss exakt dem angeforderten Ziel entsprechen.
    if destination.hash != recipient_hash:
        raise RuntimeError("LXMF Destination Hash stimmt nicht überein")

    if state is not None:
        state["lxmf_outbound_stage"] = "LXMF"
        state["updated"] = int(time.time())
        write_state(state)

    message = LXMF.LXMessage(
        destination,
        lxmf_destination,
        content,
        title=title,
    )

    lxmf_router.handle_outbound(message)

    append_lxmf_outbox({
        "timestamp": int(time.time()),
        "destination_hash": destination_hash,
        "title": title,
        "content": content,
        "message_id": (
            message.hash.hex()
            if getattr(message, "hash", None)
            else None
        ),
        "direction": "out",
    })

    if state is not None:
        state["lxmf_outbound_stage"] = "QUEUED"
        state["lxmf_outbound_result"] = "QUEUED"
        state["lxmf_outbound_error"] = None
        state["updated"] = int(time.time())
        write_state(state)

    return message

lxmf_destination = lxmf_router.register_delivery_identity(
    identity=identity,
    display_name=LXMF_DISPLAY_NAME,
)


# --------------------------------------------------
# LXMF INBOX
# --------------------------------------------------

LXMF_INBOX_FILE = STATE_DIR / "lxmf-inbox.json"
LXMF_INBOX_LIMIT = 50


def _read_lxmf_inbox():
    if not LXMF_INBOX_FILE.exists():
        return []

    try:
        data = json.loads(
            LXMF_INBOX_FILE.read_text()
        )

        if isinstance(data, list):
            return data

    except Exception:
        pass

    return []


def _write_lxmf_inbox(messages):
    tmp = LXMF_INBOX_FILE.with_suffix(".tmp")

    tmp.write_text(
        json.dumps(
            messages[-LXMF_INBOX_LIMIT:],
            indent=2,
            ensure_ascii=False
        )
    )

    tmp.replace(LXMF_INBOX_FILE)


def _lxmf_text(value):
    if value is None:
        return ""

    if isinstance(value, bytes):
        return value.decode(
            "utf-8",
            errors="replace"
        )

    return str(value)


def lxmf_delivery_callback(message):
    """
    Empfangspunkt für echte eingehende LXMF-Nachrichten.

    Keine automatische Antwort.
    Keine Weiterleitung.
    Nur lokale Persistenz.
    """

    try:
        source_hash = getattr(
            message,
            "source_hash",
            None
        )

        if isinstance(source_hash, bytes):
            source_hash = source_hash.hex()
        else:
            source_hash = str(
                source_hash or ""
            )

        timestamp = getattr(
            message,
            "timestamp",
            time.time()
        )

        try:
            timestamp = float(timestamp)
        except Exception:
            timestamp = time.time()

        content = ""

        if hasattr(message, "content_as_string"):
            try:
                content = message.content_as_string()
            except Exception:
                content = ""

        if not content:
            content = _lxmf_text(
                getattr(message, "content", "")
            )

        title = ""

        if hasattr(message, "title_as_string"):
            try:
                title = message.title_as_string()
            except Exception:
                title = ""

        if not title:
            title = _lxmf_text(
                getattr(message, "title", "")
            )

        message_id = getattr(
            message,
            "message_id",
            None
        )

        if isinstance(message_id, bytes):
            message_id = message_id.hex()
        else:
            message_id = str(
                message_id or ""
            )

        entry = {
            "timestamp": timestamp,
            "received_at": time.time(),
            "source_hash": source_hash,
            "title": title,
            "content": content,
            "message_id": message_id,
        }

        messages = _read_lxmf_inbox()

        # Doppelte Zustellung vermeiden.
        if message_id:
            for old in messages:
                if old.get("message_id") == message_id:
                    return

        messages.append(entry)

        _write_lxmf_inbox(messages)

        state["lxmf_received_count"] = len(messages)
        state["lxmf_last_received"] = timestamp
        state["lxmf_last_received_source"] = source_hash

        print(
            "LXMF RX:",
            source_hash[:16],
            title or "(ohne Titel)"
        )

    except Exception as exc:
        print(
            "LXMF RX ERROR:",
            str(exc)
        )


# Eingehende LXMF-Nachrichten an den lokalen
# Inbox-Callback übergeben.
lxmf_router.register_delivery_callback(
    lxmf_delivery_callback
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

    if OUTBOUND_REQUEST.exists():
        processing_request = Path(
            str(OUTBOUND_REQUEST) + ".processing"
        )

        try:
            # Request zuerst atomar aus der Eingangsqueue entfernen.
            # Damit kann dieselbe Datei nicht erneut verarbeitet werden.
            if processing_request.exists():
                processing_request.unlink()

            OUTBOUND_REQUEST.replace(processing_request)

            request = json.loads(
                processing_request.read_text()
            )

            request_id = str(
                request.get("request_id", "")
            ).strip()

            destination_hash = str(
                request.get("destination_hash", "")
            ).strip()

            content = str(
                request.get("content", "")
            )

            title = str(
                request.get("title", "")
            )

            if not request_id:
                raise ValueError("request_id fehlt")

            if not destination_hash or not content:
                raise ValueError("destination_hash/content fehlt")

            if state.get("lxmf_last_request_id") == request_id:
                state["lxmf_outbound_stage"] = "DUPLICATE_BLOCKED"
                state["lxmf_outbound_result"] = "DUPLICATE_BLOCKED"
                state["lxmf_outbound_error"] = None
                state["updated"] = int(time.time())
                write_state(state)

            else:
                state["lxmf_active_request_id"] = request_id
                state["lxmf_outbound_stage"] = "PROCESSING"
                state["lxmf_outbound_result"] = "PROCESSING"
                state["lxmf_outbound_error"] = None
                state["updated"] = int(time.time())
                write_state(state)

                message = send_lxmf_message(
                    destination_hash,
                    content,
                    title,
                    state=state,
                )

                state["lxmf_last_request_id"] = request_id
                state["lxmf_active_request_id"] = None
                state["lxmf_outbound_result"] = "QUEUED"
                state["lxmf_outbound_error"] = None
                state["lxmf_outbound_requested_at"] = int(time.time())
                state["updated"] = int(time.time())
                write_state(state)

        except Exception as exc:
            state["lxmf_active_request_id"] = None
            state["lxmf_outbound_stage"] = "ERROR"
            state["lxmf_outbound_result"] = "ERROR"
            state["lxmf_outbound_error"] = str(exc)
            state["updated"] = int(time.time())
            write_state(state)

        finally:
            try:
                processing_request.unlink()
            except FileNotFoundError:
                pass

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
