"""LLM tools for Reticulum."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import llm as llm_component
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import llm as llm_helper
from homeassistant.helpers.llm import (
    LLMContext,
    ToolInput,
    ToolResult,
)

from . import queue_message

DOMAIN = "reticulum"


class SendReticulumMessageTool(llm_helper.Tool):
    """Send an LXMF message over Reticulum."""

    name = "reticulum__SendReticulumMessage"
    title = "Send Reticulum message"

    description = (
        "Send a text message over the Reticulum network "
        "using LXMF. Requires a 32-character destination "
        "hash and message content."
    )

    integration = DOMAIN

    parameters = vol.Schema({
        vol.Required("destination_hash"): str,
        vol.Required("content"): str,
        vol.Optional("title", default=""): str,
    })

    async def async_call(
        self,
        hass: HomeAssistant,
        tool_input: ToolInput,
        llm_context: LLMContext,
    ) -> ToolResult:
        """Execute Reticulum LXMF send."""

        args = tool_input.tool_args

        try:
            result = await hass.async_add_executor_job(
                queue_message,
                args["destination_hash"],
                args["content"],
                args.get("title", ""),
            )

        except HomeAssistantError:
            raise

        except Exception as exc:
            raise HomeAssistantError(
                str(exc)
            ) from exc

        return ToolResult(data=result)


@callback
def async_get_tools(
    hass: HomeAssistant,
    llm_context: LLMContext,
    api_id: str,
) -> llm_component.LLMTools | None:
    """Expose Reticulum tools to the Assist API."""

    if api_id != llm_helper.LLM_API_ASSIST:
        return None

    return llm_component.LLMTools(
        tools=[
            SendReticulumMessageTool(),
        ],
        prompt=(
            "Use reticulum__SendReticulumMessage only when "
            "the user explicitly wants to send an LXMF "
            "message over Reticulum."
        ),
    )
