"""LLM tools for Reticulum."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import llm
from homeassistant.core import (
    HomeAssistant,
    callback,
)
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.llm import (
    LLMContext,
    ToolInput,
)
from homeassistant.util.json import JsonObjectType

from . import queue_message


class SendReticulumMessageTool(llm.Tool):
    """Send an LXMF message over Reticulum."""

    name = "SendReticulumMessage"

    description = (
        "Send a text message over the Reticulum network "
        "using LXMF. Requires a 32-character destination "
        "hash and message content."
    )

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
    ) -> JsonObjectType:
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

        return result


@callback
def async_get_tools(
    hass: HomeAssistant,
    llm_context: LLMContext,
    api_id: str,
) -> llm.LLMTools | None:
    """Expose Reticulum tools to LLM APIs."""

    return llm.LLMTools(
        tools=[
            SendReticulumMessageTool(),
        ],
        prompt=(
            "Use SendReticulumMessage only when the user "
            "explicitly wants to send an LXMF message "
            "over Reticulum."
        ),
    )
