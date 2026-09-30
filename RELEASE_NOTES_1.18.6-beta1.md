# N2K RNS Gateway 1.18.6-beta1

First public beta baseline for **N2K RNS Gateway DEV**.

## Highlights

- Reticulum node integration for Home Assistant
- LXMF messaging with persistent local identity
- Contact management, local aliases and QR contact cards
- Delivery state, retry workflow and message timestamps
- RNode / serial, AutoInterface and TCP interface support
- Home Assistant Ingress UI
- Integrated system self-test
- Privacy-conscious diagnostic export
- MCP connectivity through Home Assistant
- Clean-install validation on a second Home Assistant system

## Important fix in this beta

The QR contact card bug is fixed. QR requests now use POST + JSON through
Home Assistant Ingress and the generated SVG is rendered inline.

## Install

Add this repository to the Home Assistant Add-on Store:

https://github.com/netfreak2k/home-assistant-reticulum-dev

Then install **N2K RNS Gateway DEV**, start it and run:

**Messenger → Einstellungen → Systemcheck → Prüfen**

## Beta note

This is beta software. Keep a Home Assistant backup before updating.

## Licensing

Original N2K RNS Gateway code is covered by the repository LICENSE.
Reticulum, LXMF and other third-party components remain under their respective
licenses. See THIRD_PARTY_NOTICES.md.

## Development policy

Feature freeze is active. Beta changes are limited to bug fixes, compatibility,
stability, diagnostics and documentation.
