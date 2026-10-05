# N2K RNS Gateway DEV for Home Assistant

N2K RNS Gateway connects Home Assistant with the Reticulum Network Stack
and LXMF messaging.

This repository contains the current public beta development build.

## Frozen demo baseline

**1.30.53-beta1 is frozen as the approved Demo/Stream baseline.**

Do not change Demo Mode visuals, narration defaults, speech synchronization, scene timing or stream brightness in this baseline. Any future Demo Mode changes must use a new version and be treated as a new development iteration.

## Current status

**1.30.57-beta1 · Active public beta development**

The original public beta baseline has passed functional validation, update testing
and a clean-install test on a second Home Assistant system. Development has since
continued with the unified app UI, Living Mesh, network monitoring and the
privacy-safe Social Demo Mode.

The project remains beta software. Keep a working backup before installing
development updates.

Verified:

- Add-on restart
- Persistent Reticulum identity
- Persistent contacts
- Reticulum stack availability
- LXMF send
- Delivery status
- Retry workflow
- Integrated system self-test
- Privacy-safe diagnostic export
- Contact QR code generation through Home Assistant Ingress
- Clean installation on a second Home Assistant system

Not yet physically validated:

- Physical RNode USB disconnect
- Physical RNode USB reconnect
- Automatic recovery after a physical reconnect

These hardware reconnect tests remain explicitly unverified and do not block
continued software beta testing.

## For beta testers — 60 seconds

1. Open Home Assistant.
2. Go to:

   Settings → Add-ons → Add-on Store → ⋮ → Repositories

3. Add:

   https://github.com/netfreak2k/home-assistant-reticulum-dev

4. Install **N2K RNS Gateway DEV**.
5. Start the add-on.
6. Open its Web UI.
7. Go to:

   Messenger → Einstellungen → Systemcheck → Prüfen

8. If all required checks show **PASS**, the basic installation is working.

### First test

After installation:

1. Confirm the Reticulum node shows online.
2. Open Messenger.
3. Add or select a known LXMF contact.
4. Send a short test message.
5. Check that delivery state updates.
6. Run the Systemcheck again.

### If something fails

Before reporting a problem:

1. Run the Systemcheck.
2. Open:

   Messenger → Einstellungen

3. Use:

   **Diagnose exportieren**

4. Include the generated JSON file with the bug report if appropriate.

Do not publish:

- passwords
- access tokens
- API keys
- private Home Assistant URLs
- private network credentials

The diagnostic export is designed not to contain message bodies or contact
names, but users should still review files before publishing them publicly.

## Main features

- Reticulum Network Stack integration
- LXMF messaging
- Persistent local identity
- Contact management
- Local aliases
- Contact QR codes
- Contact import/export
- Delivery state and timestamps
- Retry workflow
- Peer reachability information
- Reticulum path visibility
- Hop information
- Transport/interface information
- Queue/path warnings
- TCP interface support
- AutoInterface support
- RNode / serial support
- Home Assistant Ingress UI
- Integrated system self-test
- Privacy-conscious support diagnostic export
- Unified desktop/mobile navigation
- Living Mesh topology visualization
- Live / 1 h / 5 h / Replay mesh views
- Cinematic mesh camera motion
- Read-only network monitoring with 24 h local history
- Social Demo Mode with narrator-safe ≥3:47 scripted story and 17 chapters
- 9:16 / 1:1 / 16:9 capture layouts
- Privacy-safe synthetic messenger demonstration
- Browser narration enabled by default; subtitles disabled by default
- Narrator-synchronized scene changes that wait for speech completion
- Stream-optimized brighter Demo Mode for Twitch, YouTube and live capture
- Home Assistant native state bridge with N2K sensors, binary sensors and automation events
- HA → LXMF actions for messages, announces and status refresh
- Secure LXMF → Home Assistant command events with sender whitelist
- Capture Mode for clean screen recording
- Production readability/contrast pass for muted-feed viewing and small mobile screens

## LXMF → Home Assistant commands

Version 1.30.56-beta1 adds an opt-in, whitelist-only command bridge from LXMF into Home Assistant.

Security model:

- disabled by default
- only explicitly configured full LXMF source hashes are trusted
- no incoming message can call an arbitrary Home Assistant service
- accepted commands are reduced to a fixed grammar and emitted only as a sanitized Home Assistant event
- Home Assistant automations decide what a `RUN` alias actually does
- the Home Assistant event contains only the command, alias, an 8-character source identifier and timestamp; raw message text and the full source hash are not forwarded

Add-on options:

```yaml
ha_commands_enabled: true
ha_trusted_sources: "0123456789abcdef0123456789abcdef"
```

Multiple trusted sources can be comma-separated.

Accepted LXMF messages:

```text
!HA PING
!HA STATUS
!HA HELP
!HA RUN LIGHT_ON
```

All accepted commands emit:

```text
n2k_lxmf_command
```

Example Home Assistant automation:

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

The alias is only a label. The N2K bridge never accepts a service name, entity ID, YAML fragment or free-form command payload from LXMF.

## Home Assistant actions

Version 1.30.55-beta1 adds callable Home Assistant services for automations.

Preferred N2K aliases:

- `n2k.send_message`
- `n2k.send_announce`
- `n2k.refresh_status`

The integration-native `reticulum.send_message`, `reticulum.send_announce` and `reticulum.refresh_status` names are also registered for compatibility.

Send an LXMF message:

```yaml
action:
  - service: n2k.send_message
    data:
      destination_hash: "0123456789abcdef0123456789abcdef"
      title: "Home Assistant"
      content: "WARNUNG: Netzstrom ausgefallen"
```

Send an LXMF announce:

```yaml
action:
  - service: n2k.send_announce
```

Force a status refresh:

```yaml
action:
  - service: n2k.refresh_status
```

Control requests emit a privacy-safe `n2k_control_result` event with action, success state and error text only.

## Home Assistant entities

Starting with 1.30.54-beta1 the add-on publishes native Home Assistant state entities every 15 seconds through the Home Assistant Core API.

Published entities:

- `binary_sensor.n2k_reticulum_online`
- `binary_sensor.n2k_rnode_online`
- `binary_sensor.n2k_lxmf_ready`
- `sensor.n2k_reticulum_interfaces`
- `sensor.n2k_internet_peers`
- `sensor.n2k_rnode_noise_floor`
- `sensor.n2k_rnode_airtime_15s`
- `sensor.n2k_lxmf_conversations`
- `sensor.n2k_lxmf_unread`
- `sensor.n2k_lxmf_inbox`
- `sensor.n2k_lxmf_outbox`
- `sensor.n2k_store_forward_status`

Automation events:

- `n2k_status_changed` — emitted when Reticulum, RNode or LXMF readiness changes after the initial snapshot.
- `n2k_lxmf_message_received` — emitted when the LXMF inbox count increases. Message content and contact identity are not included in the event payload.

The existing `sensor.reticulum_status` remains available for backward compatibility.

Example automation trigger:

```yaml
trigger:
  - platform: event
    event_type: n2k_lxmf_message_received

action:
  - service: notify.mobile_app
    data:
      title: "N2K RNS Gateway"
      message: "Neue LXMF-Nachricht empfangen."
```

## Documentation

- [System handbook](docs/SYSTEMHANDBUCH.md)
- [User guide](docs/USER_GUIDE.md)
- [Demo Mode & social capture](docs/DEMO_MODE.md)
- [Contributing](CONTRIBUTING.md)
- [Beta tester guide](BETA_TESTER_GUIDE.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Project license](LICENSE)

The integrated **About** section in the add-on also identifies the project,
developer, Reticulum/LXMF relationship and licensing references.

## Requirements


- Home Assistant OS or another Home Assistant installation with add-on support
- Supported architecture:
  - amd64
  - aarch64
- Network access appropriate for the Reticulum interfaces you configure
- Optional RNode-compatible serial hardware for LoRa operation

## Installation

1. Open Home Assistant.
2. Go to:

   Settings → Add-ons → Add-on Store

3. Open:

   ⋮ → Repositories

4. Add:

   https://github.com/netfreak2k/home-assistant-reticulum-dev

5. Install **N2K RNS Gateway DEV**.
6. Configure the required interfaces.
7. Start the add-on.
8. Open the add-on Web UI.
9. Run:

   Messenger → Einstellungen → Systemcheck → Prüfen

A successful installation should show a PASS result for the required software
checks.

## Basic configuration

The add-on supports:

- AutoInterface
- TCP interfaces
- Internet bootstrap
- RNode / serial interfaces
- Reticulum transport mode
- Configurable LXMF messenger name

For RNode use, configure the serial port and radio parameters according to
your hardware and local frequency regulations.

## Data persistence

The add-on stores its Reticulum/LXMF state under the Home Assistant
configuration storage used by the add-on.

The persistent state includes the Reticulum identity and local messenger data.

Do not delete persistent Reticulum data unless you intentionally want to
create a new network identity.

## Diagnostics

The Web UI contains an integrated system check covering:

- Persistent identity
- Contact storage
- LXMF inbox
- LXMF outbox
- Reticulum stack
- RNode / serial state

A support diagnostic JSON file can also be exported from the settings page.

The diagnostic export is designed not to include:

- message contents
- contact names
- message history
- passwords
- access tokens

Identity hashes are shortened/redacted in the support export.

## Beta limitations

This is beta software.

Expected limitations include:

- behaviour can still change between development releases
- edge cases with unusual Reticulum network configurations may not yet be
  covered
- physical RNode USB disconnect/reconnect recovery has not yet been validated
  on site
- the project is not an official Home Assistant, Reticulum or LXMF product

Please keep a working backup before testing new development versions.

## Reporting problems

When reporting a problem, include:

- N2K RNS Gateway version
- Home Assistant version
- hardware architecture
- configured Reticulum interface type
- Systemcheck result
- exported diagnostic JSON if relevant
- a short description of what happened

Do not publish passwords, API tokens or other private credentials.

## Development policy

The project is in active beta development.

Changes should remain incremental, testable and rollback-safe. Reticulum/LXMF
core behaviour should not be changed casually when a UI-only or read-only
solution is sufficient.

Before merging a development change:

- keep a known-good rollback point
- validate JavaScript/CSS syntax
- avoid exposing private chat/contact data in diagnostics or demos
- preserve persistent Reticulum identity and messenger data
- verify Home Assistant ingress behaviour
- document user-visible changes

## Contributing

Curious users are welcome to participate through testing, bug reports, hardware
validation, documentation, translations, UI feedback and code contributions.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the recommended workflow and privacy
rules.

## Licensing

N2K RNS Gateway contains original Netfreak2k code and third-party software.

See:

- `LICENSE`
- `THIRD_PARTY_NOTICES.md`

Reticulum and LXMF are independent third-party projects and are not owned or
maintained by Netfreak2k.

This project is not an official Home Assistant add-on and no affiliation,
sponsorship or endorsement by Home Assistant, Reticulum or LXMF is implied.

## Project

Developer:

**Netfreak2k**

Project:

**N2K RNS Gateway**

Development repository:

https://github.com/netfreak2k/home-assistant-reticulum-dev
