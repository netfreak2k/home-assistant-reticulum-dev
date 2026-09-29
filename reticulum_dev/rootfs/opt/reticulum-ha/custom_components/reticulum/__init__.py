"""Netfreak2k Reticulum bridge for Home Assistant."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

import voluptuous as vol

from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
)
from homeassistant.exceptions import HomeAssistantError

DOMAIN = "reticulum"

QUEUE_DIR = Path("/config/reticulum_bridge")
QUEUE_FILE = QUEUE_DIR / "lxmf_outbound.json"


def queue_message(
    destination_hash: str,
    content: str,
    title: str = "",
) -> dict:
    """Queue one LXMF message atomically."""

    destination_hash = destination_hash.strip()
    content = content.strip()
    title = title.strip()

    if len(destination_hash) != 32:
        raise HomeAssistantError(
            "Destination Hash muss 32 Zeichen haben"
        )

    try:
        int(destination_hash, 16)
    except ValueError as exc:
        raise HomeAssistantError(
            "Destination Hash ist kein gültiger Hex-Wert"
        ) from exc

    if not content:
        raise HomeAssistantError(
            "Nachricht darf nicht leer sein"
        )

    QUEUE_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Verhindert, dass zwei Nachrichten sich überschreiben,
    # bevor der Reticulum Node die Queue konsumiert hat.
    if QUEUE_FILE.exists():
        raise HomeAssistantError(
            "Reticulum-Sendewarteschlange ist noch belegt"
        )

    request_id = uuid.uuid4().hex

    payload = {
        "request_id": request_id,
        "destination_hash": destination_hash.lower(),
        "content": content,
        "title": title,
        "requested_at": int(time.time()),
        "source": "home_assistant",
    }

    temporary = QUEUE_FILE.with_suffix(".tmp")

    temporary.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    temporary.replace(QUEUE_FILE)

    return {
        "ok": True,
        "state": "QUEUED",
        "request_id": request_id,
        "destination_hash": destination_hash.lower(),
    }


async def async_setup(
    hass: HomeAssistant,
    config: dict,
) -> bool:
    """Set up Reticulum bridge."""

    async def handle_send_message(
        call: ServiceCall,
    ) -> None:

        await hass.async_add_executor_job(
            queue_message,
            call.data["destination_hash"],
            call.data["content"],
            call.data.get("title", ""),
        )

    schema = vol.Schema({
        vol.Required("destination_hash"): str,
        vol.Required("content"): str,
        vol.Optional("title", default=""): str,
    })

    hass.services.async_register(
        DOMAIN,
        "send_message",
        handle_send_message,
        schema=schema,
    )

    return True
