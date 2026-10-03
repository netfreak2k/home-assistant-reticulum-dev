#!/usr/bin/env python3

import json
import os
import signal
import sys
import threading
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
PROFILE_REQUEST = STATE_DIR / "messenger-profile.request"
NEARBY_SCAN_REQUEST = STATE_DIR / "nearby-scan.request"
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

PROPAGATION_DIAGNOSTICS = {
    "announce_total": 0,
    "announce_valid": 0,
    "announce_invalid": 0,
    "announce_inactive": 0,
    "announce_active": 0,
    "announce_persisted": 0,
    "announce_bad_hash": 0,
    "handler_errors": 0,
    "last_announce": 0,
    "last_candidate": "",
    "last_stage": "idle",
    "last_error": "",
    "cache_scans": 0,
    "cache_matches": 0,
    "last_cache_scan": 0,
}


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

        # RNS.Transport.hops_to() returns PATHFINDER_M (normally 128)
        # when no usable path is currently known. Do not rank that sentinel
        # as a real hop count; fall back to the fresh hop value captured with
        # the propagation announce/cache record instead.
        stored_hops = int(
            item.get("hops") or 9999
        )

        try:
            live_hops = int(
                RNS.Transport.hops_to(
                    peer_bytes
                )
            )
        except Exception:
            live_hops = 9999

        pathfinder_m = int(
            getattr(
                RNS.Transport,
                "PATHFINDER_M",
                128,
            )
            or 128
        )

        if 0 <= live_hops < pathfinder_m:
            hops = live_hops
        elif 0 <= stored_hops < pathfinder_m:
            hops = stored_hops
        else:
            hops = 9999

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

def scan_cached_propagation_nodes():
    """
    Recover LXMF propagation nodes from Reticulum's known-destination
    cache. This catches valid propagation announces that were heard
    before this add-on process registered its announce handler.

    Reticulum stores the last announce app_data for known destinations,
    so LXMF can validate the payload without guessing from the path table.
    """
    if not (
        PROPAGATION_ENABLED
        and PROPAGATION_AUTO_DISCOVERY
    ):
        return 0

    now = int(time.time())
    matched = 0

    try:
        known = getattr(
            RNS.Identity,
            "known_destinations",
            {},
        )

        if not isinstance(known, dict):
            known = {}

        nodes = _read_propagation_nodes()

        for destination_hash, entry in list(known.items()):
            if not isinstance(destination_hash, bytes):
                continue

            if (
                len(destination_hash)
                != RNS.Identity.TRUNCATED_HASHLENGTH // 8
            ):
                continue

            try:
                app_data = RNS.Identity.recall_app_data(
                    destination_hash
                )
            except Exception:
                app_data = None

            if not app_data:
                continue

            try:
                if not LXMF.pn_announce_data_is_valid(
                    app_data
                ):
                    continue

                import RNS.vendor.umsgpack as msgpack

                unpacked = msgpack.unpackb(
                    app_data
                )

                active = bool(unpacked[2])
                emitted = int(unpacked[1])
                stamp_cost = int(
                    unpacked[5][0]
                )

                peer = destination_hash.hex()

                try:
                    last_seen = int(
                        float(entry[0])
                    )
                except Exception:
                    last_seen = now

                try:
                    hops = int(
                        RNS.Transport.hops_to(
                            destination_hash
                        )
                    )
                except Exception:
                    hops = 9999

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
                        "first_seen": last_seen,
                    }
                    nodes.append(existing)

                existing.update({
                    "active": active,
                    "last_seen": max(
                        int(existing.get("last_seen") or 0),
                        last_seen,
                    ),
                    "emitted": emitted,
                    "hops": hops,
                    "stamp_cost": stamp_cost,
                    "source": "identity_cache",
                })

                matched += 1

            except Exception:
                continue

        if matched:
            _write_propagation_nodes(nodes)

        PROPAGATION_DIAGNOSTICS["cache_scans"] += 1
        PROPAGATION_DIAGNOSTICS["cache_matches"] = matched
        PROPAGATION_DIAGNOSTICS["last_cache_scan"] = now

        return matched

    except Exception as exc:
        PROPAGATION_DIAGNOSTICS["last_error"] = (
            "cache scan: " + str(exc)
        )
        return 0


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
CONTACTS_LOCK = threading.RLock()
CONTACTS_CACHE = None
CONTACTS_CACHE_MTIME_NS = None
CONTACTS_DIRTY = False
CONTACTS_LAST_FLUSH = 0.0
CONTACTS_FLUSH_INTERVAL = 5.0
CONTACT_LAST_SEEN_WRITE_INTERVAL = 30

ANNOUNCE_DEBUG_FILE = STATE_DIR / "announce-debug.json"
ANNOUNCE_DEBUG_LIMIT = 100
ANNOUNCE_DEBUG_LOCK = threading.Lock()
CONTACT_CACHE_SCAN_INTERVAL = 60

CONTACT_DISCOVERY_DIAGNOSTICS = {
    "live_announces": 0,
    "cache_scans": 0,
    "cache_candidates": 0,
    "cache_matches": 0,
    "last_cache_scan": 0,
    "last_error": "",
}


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

        with ANNOUNCE_DEBUG_LOCK:
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
                str(ANNOUNCE_DEBUG_FILE)
                + f".{os.getpid()}.{threading.get_ident()}.tmp"
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
    global CONTACTS_CACHE, CONTACTS_CACHE_MTIME_NS

    with CONTACTS_LOCK:
        try:
            current_mtime = (
                CONTACTS_FILE.stat().st_mtime_ns
                if CONTACTS_FILE.exists()
                else None
            )

            # Reload if another process (for example a backup restore) changed
            # the file while this process had no pending contact updates.
            if (
                CONTACTS_CACHE is None
                or (
                    not CONTACTS_DIRTY
                    and current_mtime != CONTACTS_CACHE_MTIME_NS
                )
            ):
                if current_mtime is None:
                    data = []
                else:
                    data = json.loads(
                        CONTACTS_FILE.read_text(encoding="utf-8")
                    )
                CONTACTS_CACHE = (
                    data[-CONTACTS_LIMIT:]
                    if isinstance(data, list)
                    else []
                )
                CONTACTS_CACHE_MTIME_NS = current_mtime

            return [dict(item) for item in CONTACTS_CACHE if isinstance(item, dict)]
        except Exception:
            if CONTACTS_CACHE is None:
                CONTACTS_CACHE = []
            return [dict(item) for item in CONTACTS_CACHE if isinstance(item, dict)]


def _write_contacts(contacts):
    global CONTACTS_CACHE_MTIME_NS

    STATE_DIR.mkdir(parents=True, exist_ok=True)

    tmp = Path(
        str(CONTACTS_FILE)
        + f".{os.getpid()}.{threading.get_ident()}.tmp"
    )

    tmp.write_text(
        json.dumps(
            contacts[-CONTACTS_LIMIT:],
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    tmp.replace(CONTACTS_FILE)
    CONTACTS_CACHE_MTIME_NS = CONTACTS_FILE.stat().st_mtime_ns


def flush_pending_contacts(force=False):
    global CONTACTS_DIRTY, CONTACTS_LAST_FLUSH

    with CONTACTS_LOCK:
        if not CONTACTS_DIRTY:
            return False

        now = time.monotonic()
        if (
            not force
            and now - CONTACTS_LAST_FLUSH < CONTACTS_FLUSH_INTERVAL
        ):
            return False

        try:
            _write_contacts(CONTACTS_CACHE or [])
        except Exception as exc:
            print("LXMF CONTACT FLUSH ERROR:", str(exc))
            return False

        CONTACTS_DIRTY = False
        CONTACTS_LAST_FLUSH = now
        return True


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
    seen_at=None,
    discovery_source="announce",
):
    global CONTACTS_DIRTY

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

        try:
            now = int(seen_at or time.time())
        except Exception:
            now = int(time.time())

        with CONTACTS_LOCK:
            contacts = _read_contacts()
            existing = next(
                (
                    item for item in contacts
                    if str(item.get("destination_hash")) == peer
                ),
                None,
            )

            is_new = existing is None
            if is_new:
                existing = {
                    "destination_hash": peer,
                    "first_seen": now,
                }
                contacts.append(existing)

            before = dict(existing)

            # Keep names current, but persist last_seen at most every 30s per
            # peer. Announce storms otherwise rewrite the whole JSON file.
            existing["announced_name"] = display_name
            if not bool(existing.get("manual_alias")):
                existing["display_name"] = display_name
            else:
                alias = str(
                    existing.get("alias")
                    or existing.get("display_name")
                    or ""
                ).strip()
                if alias:
                    existing["display_name"] = alias

            previous_seen = int(existing.get("last_seen") or 0)
            if is_new or now - previous_seen >= CONTACT_LAST_SEEN_WRITE_INTERVAL:
                existing["last_seen"] = max(previous_seen, now)
            existing["source"] = "lxmf_announce"
            existing["discovery_source"] = str(
                discovery_source or "announce"
            )

            if announced_identity is not None:
                try:
                    ih = getattr(announced_identity, "hash", None)
                    if isinstance(ih, bytes):
                        existing["identity_hash"] = ih.hex()
                except Exception:
                    pass

            if len(contacts) > CONTACTS_LIMIT:
                contacts = contacts[-CONTACTS_LIMIT:]
            CONTACTS_CACHE[:] = contacts

            if is_new or existing != before:
                CONTACTS_DIRTY = True

    except Exception as exc:
        print(
            "LXMF CONTACT UPDATE ERROR:", str(exc),
        )



def scan_cached_lxmf_contacts():
    """
    Recover LXMF delivery destinations already present in Reticulum's
    known-destination cache. This closes the gap where the add-on starts
    after peers have announced: the UI can still show those peers without
    waiting for another announce.
    """
    CONTACT_DISCOVERY_DIAGNOSTICS["cache_scans"] += 1
    CONTACT_DISCOVERY_DIAGNOSTICS["last_cache_scan"] = int(time.time())
    CONTACT_DISCOVERY_DIAGNOSTICS["last_error"] = ""

    matches = 0
    candidates = 0

    try:
        lock = getattr(
            RNS.Identity,
            "known_destinations_lock",
            None,
        )

        if lock is not None:
            with lock:
                known = dict(
                    getattr(
                        RNS.Identity,
                        "known_destinations",
                        {},
                    )
                )
        else:
            known = dict(
                getattr(
                    RNS.Identity,
                    "known_destinations",
                    {},
                )
            )

        candidates = len(known)
        CONTACT_DISCOVERY_DIAGNOSTICS["cache_candidates"] = candidates

        for destination_hash, entry in known.items():
            try:
                if not isinstance(destination_hash, bytes):
                    continue

                if not isinstance(entry, (list, tuple)):
                    continue

                if len(entry) < 4:
                    continue

                announced_at = int(float(entry[0] or 0))
                app_data = entry[3]

                if app_data is None:
                    continue

                announced_identity = RNS.Identity.recall(
                    destination_hash
                )

                if announced_identity is None:
                    continue

                expected_hash = (
                    RNS.Destination.hash_from_name_and_identity(
                        "lxmf.delivery",
                        announced_identity,
                    )
                )

                if expected_hash != destination_hash:
                    continue

                remember_lxmf_contact(
                    destination_hash,
                    announced_identity,
                    app_data,
                    seen_at=announced_at,
                    discovery_source="known_destinations_cache",
                )
                matches += 1

            except Exception:
                continue

        CONTACT_DISCOVERY_DIAGNOSTICS["cache_matches"] = matches

    except Exception as exc:
        CONTACT_DISCOVERY_DIAGNOSTICS["last_error"] = str(exc)

    return matches


def probe_known_lxmf_contacts(limit=64):
    """
    Actively request paths for locally known LXMF delivery destinations.

    Path responses are accepted by LXMFAnnounceHandler
    (receive_path_responses=True), so reachable peers can refresh their
    announce data and become visible as live scanner hits.
    """
    requested = 0
    skipped = 0

    try:
        own_hash = lxmf_destination.hash.hex()
    except Exception:
        own_hash = ""

    for item in _read_contacts():
        if requested >= max(1, int(limit or 64)):
            break

        if not isinstance(item, dict):
            skipped += 1
            continue

        peer = str(
            item.get("destination_hash") or ""
        ).strip().lower()

        if (
            len(peer) != 32
            or peer == own_hash
        ):
            skipped += 1
            continue

        try:
            peer_bytes = bytes.fromhex(peer)

            RNS.Transport.request_path(
                peer_bytes
            )

            requested += 1

        except Exception:
            skipped += 1

    CONTACT_DISCOVERY_DIAGNOSTICS[
        "last_probe_requested"
    ] = requested
    CONTACT_DISCOVERY_DIAGNOSTICS[
        "last_probe_skipped"
    ] = skipped
    CONTACT_DISCOVERY_DIAGNOSTICS[
        "last_probe_at"
    ] = int(time.time())

    return requested


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

        PROPAGATION_DIAGNOSTICS["announce_total"] += 1
        PROPAGATION_DIAGNOSTICS["last_announce"] = int(
            time.time()
        )

        try:
            if not LXMF.pn_announce_data_is_valid(
                app_data
            ):
                PROPAGATION_DIAGNOSTICS["announce_invalid"] += 1
                return

            PROPAGATION_DIAGNOSTICS["announce_valid"] += 1

            import RNS.vendor.umsgpack as msgpack

            unpacked = msgpack.unpackb(
                app_data
            )

            active = bool(unpacked[2])
            emitted = int(unpacked[1])
            stamp_cost = int(
                unpacked[5][0]
            )

            if active:
                PROPAGATION_DIAGNOSTICS["announce_active"] += 1
                PROPAGATION_DIAGNOSTICS["last_stage"] = "active"
            else:
                # A valid inactive propagation announce is still useful
                # discovery information. Persist it so the UI can
                # distinguish "known but inactive" from "never seen".
                PROPAGATION_DIAGNOSTICS["announce_inactive"] += 1
                PROPAGATION_DIAGNOSTICS["last_stage"] = "inactive"

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

            PROPAGATION_DIAGNOSTICS["last_candidate"] = peer

            if len(peer) != 32:
                PROPAGATION_DIAGNOSTICS["announce_bad_hash"] += 1
                PROPAGATION_DIAGNOSTICS["last_stage"] = "bad_hash"
                PROPAGATION_DIAGNOSTICS["last_error"] = (
                    "Propagation announce destination hash has "
                    + str(len(peer))
                    + " hex characters, expected 32"
                )
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
                "active": active,
                "last_seen": now,
                "emitted": emitted,
                "hops": hops,
                "stamp_cost": stamp_cost,
                "source": "announce",
            })

            PROPAGATION_DIAGNOSTICS["last_stage"] = "persisting"

            _write_propagation_nodes(
                nodes
            )

            PROPAGATION_DIAGNOSTICS["announce_persisted"] += 1
            PROPAGATION_DIAGNOSTICS["last_stage"] = "persisted"
            PROPAGATION_DIAGNOSTICS["last_error"] = ""

            selected = select_best_propagation_node()

            PROPAGATION_DIAGNOSTICS["last_stage"] = (
                "selected"
                if selected is not None
                else (
                    "inactive_persisted"
                    if not active
                    else "active_persisted"
                )
            )

        except Exception as exc:
            PROPAGATION_DIAGNOSTICS["handler_errors"] += 1
            PROPAGATION_DIAGNOSTICS["last_stage"] = "handler_error"
            PROPAGATION_DIAGNOSTICS["last_error"] = str(exc)
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
    # Match the canonical LXMF delivery destination exactly.
    # receive_path_responses also lets discovery learn from valid
    # path-response announces, not only unsolicited broadcasts.
    aspect_filter = "lxmf.delivery"
    receive_path_responses = True
    def received_announce(
        self,
        destination_hash,
        announced_identity,
        app_data,
    ):
        CONTACT_DISCOVERY_DIAGNOSTICS["live_announces"] += 1

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

def propagation_transfer_snapshot(router):
    """Read LXMF 1.1.1 transfer state; a request is not a completed sync."""
    code = getattr(router, "propagation_transfer_state", None)
    names = (
        "IDLE", "PATH_REQUESTED", "LINK_ESTABLISHING", "LINK_ESTABLISHED",
        "REQUEST_SENT", "RECEIVING", "RESPONSE_RECEIVED", "COMPLETE",
        "NO_PATH", "LINK_FAILED", "TRANSFER_FAILED", "NO_IDENTITY_RCVD",
        "NO_ACCESS", "FAILED",
    )
    for name in names:
        if code == getattr(LXMF.LXMRouter, "PR_" + name, object()):
            count = getattr(router, "propagation_transfer_last_result", None)
            return name, int(count) if name == "COMPLETE" and count is not None else None
    return "UNKNOWN", None


def update_propagation_runtime(now):
    state["lxmf_propagation_enabled"] = bool(PROPAGATION_ENABLED and PROPAGATION_READY)
    state["lxmf_propagation_node"] = (
        PROPAGATION_NODE_HASH.hex()
        if PROPAGATION_ENABLED and isinstance(PROPAGATION_NODE_HASH, bytes) else ""
    )
    state["lxmf_propagation_source"] = PROPAGATION_SELECTED_SOURCE or ""
    if not PROPAGATION_ENABLED or not PROPAGATION_READY:
        return
    if state.get("lxmf_propagation_request_error"):
        return
    result, count = propagation_transfer_snapshot(lxmf_router)
    if result == "IDLE":
        # Keep the last confirmed outcome while waiting for the next interval.
        state.setdefault("lxmf_propagation_sync_result", "READY")
        return
    previous = state.get("lxmf_propagation_transfer_state")
    state["lxmf_propagation_transfer_state"] = result
    state["lxmf_propagation_sync_result"] = result
    if result == "COMPLETE":
        if previous != "COMPLETE":
            state["lxmf_propagation_last_success"] = now
        state["lxmf_propagation_received"] = count
        state["lxmf_propagation_error"] = None
    elif result in ("NO_PATH", "LINK_FAILED", "TRANSFER_FAILED", "NO_IDENTITY_RCVD", "NO_ACCESS", "FAILED"):
        state["lxmf_propagation_error"] = result
    elif result != "UNKNOWN":
        state["lxmf_propagation_error"] = None


last_propagation_sync = 0
last_propagation_selection = 0
last_propagation_probe = 0
last_propagation_cache_scan = 0
last_contact_cache_scan = 0
last_contact_announce_summary = int(time.time())
last_logged_live_announces = int(
    CONTACT_DISCOVERY_DIAGNOSTICS.get("live_announces") or 0
)

# Recover valid LXMF peers that Reticulum already knew before this
# process registered its announce handler.
scan_cached_lxmf_contacts()

def apply_messenger_profile_request(state, delivery_destination):
    """Apply a persisted profile change without replacing the LXMF identity."""
    global LXMF_DISPLAY_NAME
    if not PROFILE_REQUEST.exists():
        return False
    try:
        request = json.loads(PROFILE_REQUEST.read_text(encoding="utf-8"))
        name = str(request.get("name") or "").strip()
        if not name or len(name) > 40:
            raise ValueError("Ungültiger Messenger-Name")
        delivery_destination.display_name = name
        LXMF_DISPLAY_NAME = name
        state["lxmf_display_name"] = name
        state["lxmf_profile_error"] = None
        state["updated"] = int(time.time())
        write_state(state)
        PROFILE_REQUEST.unlink(missing_ok=True)
        return True
    except Exception as exc:
        state["lxmf_profile_error"] = str(exc)
        state["updated"] = int(time.time())
        write_state(state)
        return False


while running:
    now = int(time.time())
    if apply_messenger_profile_request(state, lxmf_destination):
        # Announce the new name while retaining the existing cooldown.
        next_auto_announce = max(now, int(state.get("lxmf_last_announce") or 0) + ANNOUNCE_COOLDOWN)
        state["lxmf_next_auto_announce"] = next_auto_announce

    if NEARBY_SCAN_REQUEST.exists():
        try:
            request = json.loads(
                NEARBY_SCAN_REQUEST.read_text() or "{}"
            )
        except Exception:
            request = {}

        try:
            NEARBY_SCAN_REQUEST.unlink()
        except FileNotFoundError:
            pass

        try:
            cache_matches = scan_cached_lxmf_contacts()
            probe_requests = probe_known_lxmf_contacts()

            state["lxmf_nearby_scan_requested_at"] = int(
                request.get("requested_at", now) or now
            )
            state["lxmf_nearby_scan_probe_requests"] = int(
                probe_requests
            )
            state["lxmf_nearby_scan_cache_matches"] = int(
                cache_matches
            )
            state["lxmf_nearby_scan_error"] = None
            state["updated"] = now
            write_state(state)

        except Exception as exc:
            state["lxmf_nearby_scan_error"] = str(exc)
            state["updated"] = now
            write_state(state)

    if (
        last_contact_cache_scan == 0
        or now - last_contact_cache_scan
        >= CONTACT_CACHE_SCAN_INTERVAL
    ):
        try:
            state["lxmf_contact_cache_matches"] = (
                scan_cached_lxmf_contacts()
            )
            state["lxmf_contact_cache_candidates"] = int(
                CONTACT_DISCOVERY_DIAGNOSTICS.get(
                    "cache_candidates"
                ) or 0
            )
            state["lxmf_contact_cache_scans"] = int(
                CONTACT_DISCOVERY_DIAGNOSTICS.get(
                    "cache_scans"
                ) or 0
            )
            state["lxmf_contact_live_announces"] = int(
                CONTACT_DISCOVERY_DIAGNOSTICS.get(
                    "live_announces"
                ) or 0
            )
            state["lxmf_contact_cache_error"] = str(
                CONTACT_DISCOVERY_DIAGNOSTICS.get(
                    "last_error"
                ) or ""
            )
        except Exception as exc:
            state["lxmf_contact_cache_error"] = str(exc)

        last_contact_cache_scan = now
        state["updated"] = now
        write_state(state)

    if (
        PROPAGATION_ENABLED
        and PROPAGATION_AUTO_DISCOVERY
        and (
            last_propagation_cache_scan == 0
            or now - last_propagation_cache_scan >= 60
        )
    ):
        try:
            state["lxmf_propagation_cache_matches"] = (
                scan_cached_propagation_nodes()
            )
            state["lxmf_propagation_cache_scans"] = int(
                PROPAGATION_DIAGNOSTICS.get("cache_scans") or 0
            )
            state["lxmf_propagation_last_cache_scan"] = int(
                PROPAGATION_DIAGNOSTICS.get("last_cache_scan") or 0
            )
        except Exception as exc:
            state["lxmf_propagation_cache_error"] = str(exc)

        last_propagation_cache_scan = now
        state["lxmf_propagation_announce_total"] = int(
            PROPAGATION_DIAGNOSTICS.get("announce_total") or 0
        )
        state["lxmf_propagation_announce_valid"] = int(
            PROPAGATION_DIAGNOSTICS.get("announce_valid") or 0
        )
        state["lxmf_propagation_announce_invalid"] = int(
            PROPAGATION_DIAGNOSTICS.get("announce_invalid") or 0
        )
        state["lxmf_propagation_announce_inactive"] = int(
            PROPAGATION_DIAGNOSTICS.get("announce_inactive") or 0
        )
        state["lxmf_propagation_announce_active"] = int(
            PROPAGATION_DIAGNOSTICS.get("announce_active") or 0
        )
        state["lxmf_propagation_announce_persisted"] = int(
            PROPAGATION_DIAGNOSTICS.get("announce_persisted") or 0
        )
        state["lxmf_propagation_announce_bad_hash"] = int(
            PROPAGATION_DIAGNOSTICS.get("announce_bad_hash") or 0
        )
        state["lxmf_propagation_handler_errors"] = int(
            PROPAGATION_DIAGNOSTICS.get("handler_errors") or 0
        )
        state["lxmf_propagation_last_candidate"] = str(
            PROPAGATION_DIAGNOSTICS.get("last_candidate") or ""
        )
        state["lxmf_propagation_last_stage"] = str(
            PROPAGATION_DIAGNOSTICS.get("last_stage") or ""
        )
        state["lxmf_propagation_last_announce"] = int(
            PROPAGATION_DIAGNOSTICS.get("last_announce") or 0
        )
        state["lxmf_propagation_discovery_error"] = str(
            PROPAGATION_DIAGNOSTICS.get("last_error") or ""
        )
        state["updated"] = now
        write_state(state)

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
        and propagation_transfer_snapshot(lxmf_router)[0] not in (
            "PATH_REQUESTED", "LINK_ESTABLISHING", "LINK_ESTABLISHED",
            "REQUEST_SENT", "RECEIVING", "RESPONSE_RECEIVED",
        )
        and (
            last_propagation_sync == 0
            or now - last_propagation_sync
            >= PROPAGATION_SYNC_INTERVAL
        )
    ):
        try:
            state["lxmf_propagation_transfer_state"] = "REQUESTED"
            lxmf_router.request_messages_from_propagation_node(
                identity
            )
            state["lxmf_propagation_request_error"] = None

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
            state["lxmf_propagation_request_error"] = str(exc)
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

    update_propagation_runtime(now)
    flush_pending_contacts()

    if now - last_contact_announce_summary >= 60:
        announce_total = int(
            CONTACT_DISCOVERY_DIAGNOSTICS.get("live_announces") or 0
        )
        received = max(0, announce_total - last_logged_live_announces)
        if received:
            print(
                "LXMF ANNOUNCE SUMMARY:",
                received,
                "in the last minute; contacts stored:",
                len(_read_contacts()),
            )
        last_logged_live_announces = announce_total
        last_contact_announce_summary = now

    state["updated"] = now
    write_state(state)
    time.sleep(2)

flush_pending_contacts(force=True)
state["ok"] = False
state["updated"] = int(time.time())
write_state(state)
