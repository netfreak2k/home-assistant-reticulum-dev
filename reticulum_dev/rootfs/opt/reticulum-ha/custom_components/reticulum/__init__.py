"""Netfreak2k Reticulum Bridge."""

from __future__ import annotations

import json
import logging
import time
import uuid
from pathlib import Path
from typing import override

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import llm

DOMAIN = "reticulum"

_LOGGER = logging.getLogger(__name__)

QUEUE_DIR = Path("/config/reticulum_bridge")
QUEUE_FILE = QUEUE_DIR / "lxmf_outbound.json"


SNAPSHOT_FILES = {
    "status": QUEUE_DIR / "status.json",
    "identity": QUEUE_DIR / "identity.json",
    "contacts": QUEUE_DIR / "contacts.json",
    "messages": QUEUE_DIR / "messages.json",
}


def read_reticulum_snapshot(
    name: str,
) -> dict:
    """Read an add-on snapshot shared with Home Assistant."""

    path = SNAPSHOT_FILES.get(name)

    if path is None:
        raise HomeAssistantError(
            f"Unbekannter Reticulum Snapshot: {name}"
        )

    if not path.exists():
        raise HomeAssistantError(
            f"Reticulum Snapshot noch nicht verfügbar: {name}"
        )

    try:
        data = json.loads(
            path.read_text(
                encoding="utf-8"
            )
        )

    except Exception as exc:
        raise HomeAssistantError(
            f"Reticulum Snapshot {name} ungültig: {exc}"
        ) from exc

    if not isinstance(data, dict):
        raise HomeAssistantError(
            f"Reticulum Snapshot {name} hat ungültiges Format"
        )

    return data




def queue_message(
    destination_hash: str,
    content: str,
    title: str = "",
) -> dict:
    """Queue one LXMF message."""

    destination_hash = destination_hash.strip().lower()
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

    if QUEUE_FILE.exists():
        raise HomeAssistantError(
            "Reticulum-Sendewarteschlange ist noch belegt"
        )

    request_id = uuid.uuid4().hex

    payload = {
        "request_id": request_id,
        "destination_hash": destination_hash,
        "content": content,
        "title": title,
        "requested_at": int(time.time()),
        "source": "home_assistant_mcp",
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
        "destination_hash": destination_hash,
    }




class GetReticulumStatusTool(llm.Tool):
    """Get Reticulum status."""

    name = "reticulum__GetStatus"
    title = "Get Reticulum status"
    description = (
        "Get the current Reticulum node, interface and "
        "connectivity status."
    )
    parameters = vol.Schema({})
    integration = DOMAIN

    @override
    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: llm.ToolInput,
        llm_context: llm.LLMContext,
    ) -> llm.ToolResult:

        result = await hass.async_add_executor_job(
            read_reticulum_snapshot,
            "status",
        )

        return llm.ToolResult(data=result)


class GetReticulumIdentityTool(llm.Tool):
    """Get Reticulum identity."""

    name = "reticulum__GetIdentity"
    title = "Get Reticulum identity"
    description = (
        "Get the local Reticulum and LXMF identity status."
    )
    parameters = vol.Schema({})
    integration = DOMAIN

    @override
    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: llm.ToolInput,
        llm_context: llm.LLMContext,
    ) -> llm.ToolResult:

        result = await hass.async_add_executor_job(
            read_reticulum_snapshot,
            "identity",
        )

        return llm.ToolResult(data=result)


class GetReticulumContactsTool(llm.Tool):
    """Get Reticulum contacts."""

    name = "reticulum__GetContacts"
    title = "Get Reticulum contacts"
    description = (
        "Get known Reticulum and LXMF messenger contacts."
    )
    parameters = vol.Schema({})
    integration = DOMAIN

    @override
    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: llm.ToolInput,
        llm_context: llm.LLMContext,
    ) -> llm.ToolResult:

        result = await hass.async_add_executor_job(
            read_reticulum_snapshot,
            "contacts",
        )

        return llm.ToolResult(data=result)


class GetReticulumMessagesTool(llm.Tool):
    """Get Reticulum messages."""

    name = "reticulum__GetMessages"
    title = "Get Reticulum messages"
    description = (
        "Get Reticulum and LXMF messenger conversations "
        "and recent messages."
    )
    parameters = vol.Schema({})
    integration = DOMAIN

    @override
    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: llm.ToolInput,
        llm_context: llm.LLMContext,
    ) -> llm.ToolResult:

        result = await hass.async_add_executor_job(
            read_reticulum_snapshot,
            "messages",
        )

        return llm.ToolResult(data=result)


class SendReticulumMessageTool(llm.Tool):
    """Send an LXMF message."""

    name = "reticulum__SendReticulumMessage"
    title = "Send Reticulum message"

    description = (
        "Send a text message over Reticulum using LXMF. "
        "Requires a 32-character hexadecimal destination "
        "hash and message content."
    )

    parameters = vol.Schema({
        vol.Required("destination_hash"): str,
        vol.Required("content"): str,
        vol.Optional("title", default=""): str,
    })

    integration = DOMAIN

    @override
    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: llm.ToolInput,
        llm_context: llm.LLMContext,
    ) -> llm.ToolResult:
        """Queue an LXMF message."""

        args = tool_input.tool_args

        result = await hass.async_add_executor_job(
            queue_message,
            args["destination_hash"],
            args["content"],
            args.get("title", ""),
        )

        return llm.ToolResult(
            data=result
        )


class ReticulumAPI(llm.API):
    """Reticulum LLM API."""

    def __init__(
        self,
        hass: HomeAssistant,
    ) -> None:
        """Initialize Reticulum API."""

        super().__init__(
            hass=hass,
            id="reticulum",
            name="Reticulum 0.95.0-dev",
        )

    @override
    async def async_get_api_instance(
        self,
        llm_context: llm.LLMContext,
    ) -> llm.APIInstance:
        """Return Reticulum API instance."""

        return llm.APIInstance(
            api=self,
            api_prompt=(
                "This API sends LXMF messages over "
                "the Reticulum network."
            ),
            llm_context=llm_context,
            tools=[
                GetReticulumStatusTool(),
                GetReticulumIdentityTool(),
                GetReticulumContactsTool(),
                GetReticulumMessagesTool(),
                SendReticulumMessageTool(),
            ],
        )


async def async_setup(
    hass: HomeAssistant,
    config: dict,
) -> bool:
    """Set up Reticulum from YAML and register LLM API."""

    try:
        llm.async_register_api(
            hass,
            ReticulumAPI(hass),
        )

        _LOGGER.warning(
            "NETFREAK2K RETICULUM YAML LLM API REGISTERED: reticulum"
        )

    except HomeAssistantError as exc:
        # API may already be registered through the config entry.
        if "already registered" not in str(exc).lower():
            raise

    return True


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Set up Reticulum."""

    _LOGGER.warning(
        "NETFREAK2K RETICULUM 0.94 CONFIG ENTRY LOADING"
    )

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

    if not hass.services.has_service(
        DOMAIN,
        "send_message",
    ):
        hass.services.async_register(
            DOMAIN,
            "send_message",
            handle_send_message,
            schema=schema,
        )

    unregister_api = llm.async_register_api(
        hass,
        ReticulumAPI(hass),
    )

    entry.async_on_unload(
        unregister_api
    )

    _LOGGER.warning(
        "NETFREAK2K RETICULUM LLM API REGISTERED: reticulum"
    )

    return True


async def async_unload_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> bool:
    """Unload Reticulum."""

    if hass.services.has_service(
        DOMAIN,
        "send_message",
    ):
        hass.services.async_remove(
            DOMAIN,
            "send_message",
        )

    return True
