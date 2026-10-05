# N2K RNS Gateway DEV 1.30.55-beta1

## Home Assistant Actions

This release adds direct Home Assistant actions for Reticulum/LXMF workflows.

### Services

Preferred aliases:

- n2k.send_message
- n2k.send_announce
- n2k.refresh_status

Compatibility aliases:

- reticulum.send_message
- reticulum.send_announce
- reticulum.refresh_status

### Send message

```yaml
action:
  - service: n2k.send_message
    data:
      destination_hash: "0123456789abcdef0123456789abcdef"
      title: "Home Assistant"
      content: "WARNUNG: Netzstrom ausgefallen"
```

### Announce

```yaml
action:
  - service: n2k.send_announce
```

### Refresh state

```yaml
action:
  - service: n2k.refresh_status
```

### Runtime behavior

- LXMF send reuses the existing atomic outbound queue.
- Announce and refresh use a shared control request consumed by the add-on backend.
- Control outcomes emit n2k_control_result with action, success state and error text only.
- No message body or contact identity is included in control-result events.
- The frozen Demo/Stream implementation remains unchanged.
