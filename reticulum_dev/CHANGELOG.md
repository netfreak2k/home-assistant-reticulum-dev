## 1.19.0-beta1

- Added **Mesh Photo** sending inside LXMF chats.
- Added camera/photo-library picker in the chat composer.
- Photos are compressed locally in the browser to roughly 320 px and a target of about 18 KB JPEG before sending.
- Added image preview, compressed dimensions/size and explicit **Foto senden** confirmation.
- Received Mesh Photo messages render inline in chat; chat list shows **📷 Foto** instead of encoded payload data.
- Added server-side photo payload validation and size protection.
- Pending photos are bound to the selected contact and discarded if the destination changes.
- Existing text-message send/receive path remains unchanged.
- Added in-app handbook documentation for Mesh Photo.
- Rollback branch: `backup-1.18.9-beta1-before-photos`.

## 1.18.9-beta1

- Fixed mobile Status view not loading the Messenger profile panel.
- **Jetzt announcen** is now visible again under Status → Mein Messenger on mobile.
- Reused the existing LXMF announce endpoint; no protocol or radio behaviour changed.

## 1.18.8-beta1

- Added a 30-second passive **Umgebungsscanner** under Contacts.
- Scanner shows LXMF announces heard during the scan window.
- Results include display name/hash, last-seen age, Reticulum hop count and interface when available.
- Added direct **Chat** action for detected peers.
- Scanner is passive: it does not transmit extra RF traffic, request paths or change RNode/Reticulum configuration.
- Clarified that “nearby” means recently seen on configured Reticulum interfaces, not physical distance in metres.

## 1.18.7-beta1

- Added an in-app **Hilfe & Handbuch** section under Status.
- Added offline searchable system documentation for installation, Identity/Announce, contacts/QR, LXMF chat, RNode/USB, network interfaces, updates/backups, diagnostics and privacy.
- Added an integrated FAQ and troubleshooting guidance.
- Help content ships locally with the add-on and does not require an external documentation site.

## 1.18.6-beta1

- Public beta baseline.
- Fix contact QR generation in Home Assistant Ingress.
- Use POST + JSON for the QR request to avoid query-string/Ingress failures.
- Render generated SVG inline in the contact modal.
- Clean-install validation completed on a second Home Assistant system.
- Documentation, licensing, update and backup checks completed.
- Feature freeze remains active; beta work is limited to stabilization.

## 1.18.4-dev

- Fix Diagnostics · rnstatus staying on "Loading…".
- Start the existing status refresh on page load and refresh it every 10 seconds.
- No Reticulum, RNode, firmware or RF configuration changes.

## 1.18.3-dev

- Increase the manual RNode info probe timeout from 5 to 15 seconds.
- Keep the probe read-only; no flashing, RF changes or automatic activation.
- Improve timeout diagnostics for slower RNode handshakes.

## 1.18.2-dev

- Add live RNode interface telemetry to the Web UI.
- Parse Noise Floor, Airtime, Channel Load and CPU load from rnstatus.
- Expose live RNode status, rate and RX/TX counters via the existing RNode API.
- Keep hardware/RF changes manual; telemetry is read-only.

# Changelog

## 0.1.0

- Initial Home Assistant add-on structure
- amd64 support
- aarch64 support
- Persistent add-on configuration
