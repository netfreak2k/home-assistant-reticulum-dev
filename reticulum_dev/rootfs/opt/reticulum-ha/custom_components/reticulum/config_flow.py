"""Config flow for Netfreak2k Reticulum Bridge."""

from __future__ import annotations

from typing import Any

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

DOMAIN = "reticulum"


class ReticulumConfigFlow(
    config_entries.ConfigFlow,
    domain=DOMAIN,
):
    """Handle a config flow for Reticulum."""

    VERSION = 1

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> FlowResult:
        """Handle the initial step."""

        await self.async_set_unique_id(
            "netfreak2k_reticulum_bridge"
        )
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(
                title="Reticulum",
                data={},
            )

        return self.async_show_form(
            step_id="user",
        )
