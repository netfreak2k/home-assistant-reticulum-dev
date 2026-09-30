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

# Automatic LXMF presence announcement.
AUTO_ANNOUNCE_INITIAL_DELAY = 20
AUTO_ANNOUNCE_INTERVAL = 6 * 60 * 60

LXMF_DISPLAY_NAME = (
    os.environ.get(
        "RETICULUM_MESSENGER_NAME",
        "Home Assistant",
    ).strip()
    or "Home Assistant"
)

PROPAGATION_ENABLED = (
    os.environ.get(
        "RETICULUM_PROPAGATION_ENABLED",
        "false",
    ).strip().lower()
    in ("1", "true", "yes", "on")
)

PROPAGATION_AUTO_DISCOVERY = (
    os.environ.get(
        "RETICULUM_PROPAGATION_AUTO_DISCOVERY",
        "true",
    ).strip().lower()
    in ("1", "true", "yes", "on")
)

PROPAGATION_NODE_HEX = os.environ.get(
    "RETICULUM_PROPAGATION_NODE",
    "",
).strip().lower()

PROPAGATION_AUTO_SYNC = (
    os.environ.get(
        "RETICULUM_PROPAGATION_AUTO_SYNC",
        "true",
    ).strip().lower()
    in ("1", "true", "yes", "on")
)

try:
    PROPAGATION_SYNC_INTERVAL = max(
        300,
        int(
            os.environ.get(
                "RETICULUM_PROPAGATION_SYNC_INTERVAL",
                "900",
            )
        ),
    )
except Exception:
    PROPAGATION_SYNC_INTERVAL = 900

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
    name=LXMF_DISPLAY_NAME,
)

PROPAGATION_NODE_HASH = None
PROPAGATION_READY = False
PROPAGATION_SELECTED_SOURCE = None


def _read_propagation_nodes():
    try:
        if not PROPAGATION_NODES_FILE.exists():
            return []

        value = json.loads(
            PROPAGATION_NODES_FILE.read_text(
                encoding="utf-8"
            )
        )

        return value if isinstance(value, list) else []

    except Exception:
        return []


def _write_propagation_nodes(nodes):
    STATE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    tmp = Path(
        str(PROPAGATION_NODES_FILE) + ".tmp"
    )

    tmp.write_text(
        json.dumps(
            nodes[-PROPAGATION_NODE_LIMIT:],
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    tmp.replace(
        PROPAGATION_NODES_FILE
    )


def _set_propagation_node(
    destination_hash,
    source,
):
    global PROPAGATION_NODE_HASH
    global PROPAGATION_READY
    global PROPAGATION_SELECTED_SOURCE

    if not isinstance(destination_hash, bytes):
        raise ValueError(
            "Propagation destination must be bytes"
        )

    if (
        len(destination_hash)
        != RNS.Identity.TRUNCATED_HASHLENGTH // 8
    ):
        raise ValueError(
            "Invalid propagation destination length"
        )

    lxmf_router.set_outbound_propagation_node(
        destination_hash
    )

    PROPAGATION_NODE_HASH = destination_hash
    PROPAGATION_READY = True
    PROPAGATION_SELECTED_SOURCE = source

    RNS.log(
        "LXMF propagation node selected: "
        + destination_hash.hex()
        + " ("
        + str(source)
        + ")",
        RNS.LOG_INFO,
    )


def select_best_propagation_node():
    if not (
        PROPAGATION_ENABLED
        and PROPAGATION_AUTO_DISCOVERY
    ):
        return None

    now = int(time.time())

    candidates = []

    for item in _read_propagation_nodes():
        if not isinstance(item, dict):
            continue

        if item.get("active") is not True:
            continue

        seen = int(
            item.get("last_seen") or 0
        )

        if not seen or now - seen > PROPAGATION_NODE_TTL:
            continue

        peer = str(
            item.get("destination_hash") or ""
        ).strip().lower()

        if len(peer) != 32:
            continue

        try:
            peer_bytes = bytes.fromhex(peer)
        except Exception:
            continue

        try:
            hops = int(
                RNS.Transport.hops_to(
                    peer_bytes
                )
            )
        except Exception:
            hops = int(
                item.get("hops") or 9999
            )

        candidates.append({
            "peer": peer,
            "bytes": peer_bytes,
            "hops": hops,
            "last_seen": seen,
            "stamp_cost": int(
                item.get("stamp_cost") or 0
            ),
        })

    if not candidates:
        return None

    candidates.sort(
        key=lambda item: (
            item["hops"],
            -item["last_seen"],
            item["stamp_cost"],
        )
    )

    best = candidates[0]

    current_hex = (
        PROPAGATION_NODE_HASH.hex()
        if isinstance(
            PROPAGATION_NODE_HASH,
            bytes,
        )
        else ""
    )

    # Avoid needless switching: keep the current discovered
    # node when it remains fresh and is at most one hop worse.
    if current_hex:
        current = next(
            (
                item
                for item in candidates
                if item["peer"] == current_hex
            ),
            None,
        )

        if (
            current is not None
            and current["hops"]
            <= best["hops"] + 1
        ):
            return current

    _set_propagation_node(
        best["bytes"],
        "auto",
    )

    return best


if (
    PROPAGATION_ENABLED
    and not PROPAGATION_AUTO_DISCOVERY
):
    try:
        candidate = bytes.fromhex(
            PROPAGATION_NODE_HEX
        )

        _set_propagation_node(
            candidate,
            "manual",
        )

    except Exception as exc:
        RNS.log(
            "LXMF propagation manual node invalid: "
            + str(exc),
            RNS.LOG_ERROR,
        )

OUTBOUND_REQUEST = Path("/homeassistant/reticulum_bridge/lxmf_outbound.json")


LXMF_OUTBOX_FILE = STATE_DIR / "lxmf-outbox.json"
LXMF_OUTBOX_LIMIT = 100

PROPAGATION_NODES_FILE = STATE_DIR / "propagation-nodes.json"
PROPAGATION_NODE_LIMIT = 100
# Keep discovered propagation nodes long enough to survive normal
# announce intervals. Stale entries are periodically probed with a
# targeted Reticulum path request instead of being discarded after
# only 30 minutes.
PROPAGATION_NODE_TTL = 24 * 60 * 60
PROPAGATION_SELECTION_INTERVAL = 60
PROPAGATION_PROBE_INTERVAL = 5 * 60
PROPAGATION_PROBE_AFTER = 15 * 60
PROPAGATION_PROBE_LIMIT = 3


# --------------------------------------------------

def probe_known_propagation_nodes():
    """
    Re-check a few previously discovered propagation nodes.

    Reticulum does not provide a global service directory. A fresh
    lxmf.propagation announce is normally required for discovery.
    Once a node has been heard, however, a targeted path request can
    provoke a fresh announce/path response and keeps Store & Forward
    useful even when propagation nodes announce infrequently.
    """
    if not (
        PROPAGATION_ENABLED
        and PROPAGATION_AUTO_DISCOVERY
    ):
        return 0

    now = int(time.time())
    probe = []

    for item in _read_propagation_nodes():
        if not isinstance(item, dict):
            continue

        if item.get("active") is not True:
            continue

        peer = str(
            item.get("destination_hash") or ""
        ).strip().lower()

        seen = int(
            item.get("last_seen") or 0
        )

        if len(peer) != 32 or not seen:
            continue

        age = now - seen

        if age < PROPAGATION_PROBE_AFTER:
            continue

        # Very old entries are kept on disk for diagnostics, but are
        # not actively probed forever.
        if age > 7 * 24 * 60 * 60:
            continue

        try:
            peer_bytes = bytes.fromhex(peer)
        except Exception:
            continue

        probe.append(
            (seen, peer_bytes, peer)
        )

    # Prefer the most recently heard nodes and limit network traffic.
    probe.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    requested = 0

    for _, peer_bytes, peer in probe[:PROPAGATION_PROBE_LIMIT]:
        try:
            RNS.Transport.request_path(
                peer_bytes
            )
            requested += 1

            RNS.log(
                "LXMF propagation probe requested: "
                + peer,
                RNS.LOG_DEBUG,
            )

        except Exception as exc:
            RNS.log(
                "LXMF propagation probe error for "
                + peer
                + ": "
                + str(exc),
                RNS.LOG_WARNING,
            )

    return requested


# LXMF CONTACT DISCOVERY
# --------------------------------------------------

CONTACTS_FILE = STATE_DIR / "contacts.json"
CONTACTS_LIMIT = 500

ANNOUNCE_DEBUG_FILE = STATE_DIR / "announce-debug.json"
ANNOUNCE_DEBUG_LIMIT = 100


def record_announce_debug(
    destination_hash,
    announced_identity,
    app_data,
):
    try:
        if isinstance(destination_hash, bytes):
            destination = destination_hash.hex()
        else:
            destination = str(destination_hash or "")

        identity_hash = ""

        if announced_identity is not None:
            value = getattr(
                announced_identity,
                "hash",
                None,
            )

            if isinstance(value, bytes):
                identity_hash = value.hex()
            elif value is not None:
                identity_hash = str(value)

        if isinstance(app_data, bytes):
            app_hex = app_data.hex()
            app_text = app_data.decode(
                "utf-8",
                errors="replace",
            )
        elif app_data is None:
            app_hex = ""
            app_text = ""
        else:
            app_hex = ""
            app_text = str(app_data)

        entry = {
            "timestamp": int(time.time()),
            "destination_hash": destination,
            "identity_hash": identity_hash,
            "app_data_type": type(app_data).__name__,
            "app_data_hex": app_hex[:1024],
            "app_data_text": app_text[:512],
        }

        try:
            if ANNOUNCE_DEBUG_FILE.exists():
                data = json.loads(
                    ANNOUNCE_DEBUG_FILE.read_text(
                        encoding="utf-8"
                    )
                )
            else:
                data = []
        except Exception:
            data = []

        if not isinstance(data, list):
            data = []

        data.append(entry)
        data = data[-ANNOUNCE_DEBUG_LIMIT:]

        tmp = Path(
            str(ANNOUNCE_DEBUG_FILE) + ".tmp"
        )

        tmp.write_text(
            json.dumps(
                data,
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        tmp.replace(ANNOUNCE_DEBUG_FILE)

        print(
            "RNS ANNOUNCE RX:",
            destination[:16],
            "app_data=",
            type(app_data).__name__,
            "bytes=",
            len(app_data)
            if isinstance(app_data, bytes)
            else 0,
        )

    except Exception as exc:
        print(
            "RNS ANNOUNCE DEBUG ERROR:",
            str(exc),
        )




def _read_contacts():
    try:
        if not CONTACTS_FILE.exists():
            return []

        data = json.loads(
            CONTACTS_FILE.read_text(encoding="utf-8")
        )

        return data if isinstance(data, list) else []

    except Exception:
        return []


def _write_contacts(contacts):
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    tmp = Path(str(CONTACTS_FILE) + ".tmp")

    tmp.write_text(
        json.dumps(
            contacts[-CONTACTS_LIMIT:],
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    tmp.replace(CONTACTS_FILE)


def _announce_text(app_data):
    if app_data is None:
        return ""

    if isinstance(app_data, bytes):
        # LXMF display names are normally encoded using
        # LXMF announce data. Try the LXMF helper first.
        try:
            value = LXMF.display_name_from_app_data(
                app_data
            )

            if value:
                return str(value).strip()

        except Exception:
            pass

        try:
            return app_data.decode(
                "utf-8",
                errors="replace",
            ).strip()

        except Exception:
            return ""

    return str(app_data).strip()


def remember_lxmf_contact(
    destination_hash,
    announced_identity,
    app_data,
):
    try:
        if isinstance(destination_hash, bytes):
            peer = destination_hash.hex()
        else:
            peer = str(destination_hash or "").strip()

        if len(peer) != 32:
            return

        # Never add ourselves to the contact list.
        if peer == lxmf_destination.hash.hex():
            return

        # Messenger discovery requires application data.
        # Generic RNS announces without app data are ignored.
        if app_data is None:
            return

        display_name = _announce_text(app_data)

        if not display_name:
            return

        # Reject obviously unusable binary-decoder output.
        display_name = display_name.strip()

        if not display_name:
            return

        now = int(time.time())
        contacts = _read_contacts()

        existing = None

        for item in contacts:
            if str(item.get("destination_hash")) == peer:
                existing = item
                break

        if existing is None:
            existing = {
                "destination_hash": peer,
                "first_seen": now,
            }
            contacts.append(existing)

        existing["display_name"] = display_name
        existing["last_seen"] = now
        existing["source"] = "lxmf_announce"

        if announced_identity is not None:
            try:
                ih = getattr(
                    announced_identity,
                    "hash",
                    None,
                )

                if isinstance(ih, bytes):
                    existing["identity_hash"] = ih.hex()

            except Exception:
                pass

        _write_contacts(contacts)

        print(
            "LXMF CONTACT:",
            display_name,
            peer[:16],
        )

    except Exception as exc:
        print(
            "LXMF CONTACT ERROR:",
            str(exc),
        )


class LXMFPropagationDiscoveryHandler:
    aspect_filter = "lxmf.propagation"

    def received_announce(
        self,
        destination_hash,
        announced_identity,
        app_data,
        *args,
        **kwargs,
    ):
        if not PROPAGATION_ENABLED:
            return

        if not PROPAGATION_AUTO_DISCOVERY:
            return

        try:
            if not LXMF.pn_announce_data_is_valid(
                app_data
            ):
                return

            import msgpack

            unpacked = msgpack.unpackb(
                app_data
            )

            active = bool(unpacked[2])
            emitted = int(unpacked[1])
            stamp_cost = int(
                unpacked[5][0]
            )

            if not active:
                return

            if isinstance(
                destination_hash,
                bytes,
            ):
                peer = destination_hash.hex()
                peer_bytes = destination_hash
            else:
                peer = str(
                    destination_hash or ""
                ).strip().lower()
                peer_bytes = bytes.fromhex(
                    peer
                )

            if len(peer) != 32:
                return

            try:
                hops = int(
                    RNS.Transport.hops_to(
                        peer_bytes
                    )
                )
            except Exception:
                hops = 9999

            now = int(time.time())

            nodes = _read_propagation_nodes()

            existing = next(
                (
                    item
                    for item in nodes
                    if isinstance(item, dict)
                    and item.get("destination_hash")
                    == peer
                ),
                None,
            )

            if existing is None:
                existing = {
                    "destination_hash": peer,
                    "first_seen": now,
                }
                nodes.append(existing)

            existing.update({
                "active": True,
                "last_seen": now,
                "emitted": emitted,
                "hops": hops,
                "stamp_cost": stamp_cost,
            })

            _write_propagation_nodes(
                nodes
            )

            select_best_propagation_node()

        except Exception as exc:
            RNS.log(
                "LXMF propagation discovery error: "
                + str(exc),
                RNS.LOG_WARNING,
            )


propagation_discovery_handler = (
    LXMFPropagationDiscoveryHandler()
)

RNS.Transport.register_announce_handler(
    propagation_discovery_handler
)


class LXMFAnnounceHandler:
    # Intentionally no aspect_filter here.
    #
    # RNS 1.5.4 will therefore pass announces to this
    # handler regardless of aspect. We only persist
    # announces that contain usable application data.
    #
    # This avoids depending on an assumed LXMF aspect
    # while keeping discovery passive.
    def received_announce(
        self,
        destination_hash,
        announced_identity,
        app_data,
    ):
        record_announce_debug(
            destination_hash,
            announced_identity,
            app_data,
        )

        remember_lxmf_contact(
            destination_hash,
            announced_identity,
            app_data,
        )


lxmf_announce_handler = LXMFAnnounceHandler()

RNS.Transport.register_announce_handler(
    lxmf_announce_handler
)



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



def update_lxmf_outbox_status(
    message_id,
    delivery_status,
    error=None,
):
    try:
        message_id = str(message_id or "").strip()

        if not message_id:
            return

        if LXMF_OUTBOX_FILE.exists():
            data = json.loads(
                LXMF_OUTBOX_FILE.read_text()
            )
        else:
            data = []

        if not isinstance(data, list):
            return

        changed = False
        now = int(time.time())

        for item in reversed(data):
            if not isinstance(item, dict):
                continue

            if str(
                item.get("message_id") or ""
            ) != message_id:
                continue

            item["delivery_status"] = delivery_status
            item["delivery_updated_at"] = now

            if delivery_status == "delivered":
                item["delivered_at"] = now
                item["delivery_error"] = None

            elif delivery_status == "failed":
                item["delivery_error"] = str(
                    error or "LXMF delivery failed"
                )

            changed = True
            break

        if not changed:
            return

        tmp = Path(
            str(LXMF_OUTBOX_FILE) + ".tmp"
        )

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
            "LXMF delivery status error: "
            + str(exc),
            RNS.LOG_ERROR,
        )


def lxmf_message_id(message):
    value = getattr(
        message,
        "hash",
        None,
    )

    if isinstance(value, bytes):
        return value.hex()

    return str(value or "")


def lxmf_outbound_delivered(message):
    message_id = lxmf_message_id(message)

    propagated = (
        getattr(message, "method", None)
        == LXMF.LXMessage.PROPAGATED
        or getattr(message, "desired_method", None)
        == LXMF.LXMessage.PROPAGATED
    )

    status = (
        "propagated"
        if propagated
        else "delivered"
    )

    update_lxmf_outbox_status(
        message_id,
        status,
    )

    RNS.log(
        (
            "LXMF PROPAGATED: "
            if propagated
            else "LXMF DELIVERED: "
        ) + message_id,
        RNS.LOG_INFO,
    )


def lxmf_outbound_failed(message):
    message_id = lxmf_message_id(message)

    update_lxmf_outbox_status(
        message_id,
        "failed",
        "Delivery confirmation failed",
    )

    RNS.log(
        "LXMF FAILED: " + message_id,
        RNS.LOG_WARNING,
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

    direct_path = RNS.Transport.has_path(
        recipient_hash
    )

    use_propagation = (
        not direct_path
        and PROPAGATION_ENABLED
        and PROPAGATION_READY
        and PROPAGATION_NODE_HASH is not None
    )

    if not direct_path and not use_propagation:
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
        state["lxmf_outbound_path"] = bool(
            direct_path
        )
        state["lxmf_outbound_method"] = (
            "PROPAGATED"
            if use_propagation
            else "DIRECT"
        )
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

    message_kwargs = {
        "title": title,
    }

    if use_propagation:
        message_kwargs["desired_method"] = (
            LXMF.LXMessage.PROPAGATED
        )

    message = LXMF.LXMessage(
        destination,
        lxmf_destination,
        content,
        **message_kwargs,
    )

    message.register_delivery_callback(
        lxmf_outbound_delivered
    )

    message.register_failed_callback(
        lxmf_outbound_failed
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
        "delivery_status": "queued",
        "delivery_method": (
            "propagated"
            if use_propagation
            else "direct"
        ),
        "propagation_node": (
            PROPAGATION_NODE_HASH.hex()
            if (
                use_propagation
                and isinstance(
                    PROPAGATION_NODE_HASH,
                    bytes,
                )
            )
            else None
        ),
        "delivery_updated_at": int(time.time()),
        "delivered_at": None,
        "delivery_error": None,
    })

    if state is not None:
        state["lxmf_outbound_stage"] = (
            "PROPAGATED"
            if use_propagation
            else "QUEUED"
        )
        state["lxmf_outbound_result"] = (
            "PROPAGATED"
            if use_propagation
            else "QUEUED"
        )
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
    "announce_mode": "automatic",
    "lxmf_auto_announce": True,
    "lxmf_auto_announce_interval": AUTO_ANNOUNCE_INTERVAL,
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

# Give Reticulum and the Internet interfaces time to settle.
next_auto_announce = (
    int(time.time()) + AUTO_ANNOUNCE_INITIAL_DELAY
)

last_propagation_sync = 0
last_propagation_selection = 0
last_propagation_probe = 0

while running:
    now = int(time.time())

    if (
        PROPAGATION_ENABLED
        and PROPAGATION_AUTO_DISCOVERY
        and (
            last_propagation_probe == 0
            or now - last_propagation_probe
            >= PROPAGATION_PROBE_INTERVAL
        )
    ):
        try:
            state["lxmf_propagation_probe_requests"] = (
                probe_known_propagation_nodes()
            )
            state["lxmf_propagation_last_probe"] = now
            state["lxmf_propagation_probe_error"] = None
        except Exception as exc:
            state["lxmf_propagation_probe_error"] = str(exc)

        last_propagation_probe = now
        state["updated"] = now
        write_state(state)

    if (
        PROPAGATION_ENABLED
        and PROPAGATION_AUTO_DISCOVERY
        and (
            last_propagation_selection == 0
            or now - last_propagation_selection
            >= PROPAGATION_SELECTION_INTERVAL
        )
    ):
        try:
            selected = (
                select_best_propagation_node()
            )

            last_propagation_selection = now

            state["lxmf_propagation_auto_discovery"] = True
            state["lxmf_propagation_candidates"] = len(
                [
                    item
                    for item in _read_propagation_nodes()
                    if isinstance(item, dict)
                    and int(
                        item.get("last_seen") or 0
                    ) >= now - PROPAGATION_NODE_TTL
                ]
            )

            if selected is not None:
                state["lxmf_propagation_selected_hops"] = int(
                    selected.get("hops") or 0
                )

            state["updated"] = now
            write_state(state)

        except Exception as exc:
            last_propagation_selection = now
            state["lxmf_propagation_selection_error"] = str(exc)
            state["updated"] = now
            write_state(state)

    if (
        PROPAGATION_ENABLED
        and PROPAGATION_READY
        and PROPAGATION_AUTO_SYNC
        and (
            last_propagation_sync == 0
            or now - last_propagation_sync
            >= PROPAGATION_SYNC_INTERVAL
        )
    ):
        try:
            lxmf_router.request_messages_from_propagation_node(
                identity
            )

            last_propagation_sync = now
            state["lxmf_propagation_enabled"] = True
            state["lxmf_propagation_node"] = (
                PROPAGATION_NODE_HASH.hex()
                if isinstance(
                    PROPAGATION_NODE_HASH,
                    bytes,
                )
                else ""
            )
            state["lxmf_propagation_source"] = (
                PROPAGATION_SELECTED_SOURCE
            )
            state["lxmf_propagation_last_sync"] = now
            state["lxmf_propagation_sync_result"] = "REQUESTED"
            state["lxmf_propagation_error"] = None
            state["updated"] = now
            write_state(state)

        except Exception as exc:
            last_propagation_sync = now
            state["lxmf_propagation_enabled"] = True
            state["lxmf_propagation_node"] = (
                PROPAGATION_NODE_HEX
            )
            state["lxmf_propagation_last_sync"] = now
            state["lxmf_propagation_sync_result"] = "ERROR"
            state["lxmf_propagation_error"] = str(exc)
            state["updated"] = now
            write_state(state)

    elif not PROPAGATION_ENABLED:
        state["lxmf_propagation_enabled"] = False
        state["lxmf_propagation_auto_discovery"] = (
            PROPAGATION_AUTO_DISCOVERY
        )

    # --------------------------------------------------
    # Automatic LXMF announce
    # --------------------------------------------------
    if now >= next_auto_announce:
        try:
            lxmf_router.announce(
                lxmf_destination.hash
            )

            state["lxmf_announced"] = True
            state["lxmf_last_announce"] = now
            state["lxmf_announce_result"] = "AUTO_SENT"
            state["lxmf_announce_error"] = None
            state["lxmf_announce_source"] = "automatic"

            next_auto_announce = (
                now + AUTO_ANNOUNCE_INTERVAL
            )

            state["lxmf_next_auto_announce"] = (
                next_auto_announce
            )

            state["updated"] = now
            write_state(state)

            print(
                "LXMF AUTO ANNOUNCE:",
                LXMF_DISPLAY_NAME,
                lxmf_destination.hash.hex(),
            )

        except Exception as exc:
            state["lxmf_announce_result"] = "AUTO_ERROR"
            state["lxmf_announce_error"] = str(exc)
            state["updated"] = now
            write_state(state)

            # Retry later instead of looping aggressively.
            next_auto_announce = now + 300

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
                state["lxmf_announce_source"] = "manual"
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
