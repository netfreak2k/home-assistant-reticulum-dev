# N2K RNS Gateway DEV 1.30.56-beta1

## Secure LXMF -> Home Assistant Commands

This release adds a whitelist-only command bridge from LXMF to Home Assistant.

### Security model

- disabled by default
- only explicitly trusted full LXMF source hashes are accepted
- no arbitrary Home Assistant service name is accepted from LXMF
- no entity ID, YAML fragment or free-form payload is executed
- incoming commands are reduced to a fixed grammar
- Home Assistant receives only a sanitized event

### Add-on options

```yaml
ha_commands_enabled: true
ha_trusted_sources: "0123456789abcdef0123456789abcdef"
```

Multiple trusted hashes can be comma-separated.

### Accepted messages

```text
!HA PING
!HA STATUS
!HA HELP
!HA RUN LIGHT_ON
```

RUN aliases are restricted to A-Z, 0-9, underscore and hyphen, maximum 32 characters.

### Home Assistant event

Accepted commands emit:

```text
n2k_lxmf_command
```

Event data contains:

- command
- alias
- short 8-character source identifier
- received timestamp

Raw message text and the full source hash are not forwarded to the Home Assistant event bus.

### Example automation

```yaml
trigger:
  - platform: event
    event_type: n2k_lxmf_command
    event_data:
      command: RUN
      alias: LIGHT_ON

action:
  - service: light.turn_on
    target:
      entity_id: light.example
```

The bridge itself never calls the service directly. Home Assistant remains the policy and execution layer.

The frozen Demo/Stream implementation remains unchanged.
