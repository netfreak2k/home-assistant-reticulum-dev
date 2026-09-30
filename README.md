# N2K RNS Gateway DEV for Home Assistant

N2K RNS Gateway connects Home Assistant with the Reticulum Network Stack
and LXMF messaging.

This repository contains the current public beta development build.

## Current status

**1.14.3-dev · Public Beta Preparation**

The core software stack has passed remote beta validation.

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

Not yet physically validated:

- Physical RNode USB disconnect
- Physical RNode USB reconnect
- Automatic recovery after a physical reconnect

These hardware reconnect tests remain explicitly unverified and do not block
continued software beta testing.

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

The project is currently under feature freeze for beta stabilization.

Allowed changes:

- bug fixes
- compatibility fixes
- stability improvements
- diagnostics
- documentation
- licensing corrections

Major UI redesigns and protocol architecture changes are postponed until the
beta baseline is considered stable.

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
