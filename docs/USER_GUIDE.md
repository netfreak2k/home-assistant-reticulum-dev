# N2K RNS Gateway — User Guide

This guide documents the beta baseline for the Home Assistant add-on.

## 1. Installation

1. Open Home Assistant.
2. Go to **Settings → Add-ons → Add-on Store**.
3. Open **⋮ → Repositories**.
4. Add:
   `https://github.com/netfreak2k/home-assistant-reticulum-dev`
5. Install **N2K RNS Gateway DEV**.
6. Start the add-on.
7. Open the Web UI.

## 2. First start

After the first start:

1. Confirm that the Reticulum node reports **online**.
2. Open **Messenger → Einstellungen**.
3. Run **Systemcheck → Prüfen**.
4. Keep the generated Reticulum identity. It is persistent and represents
   this gateway on the network.

Do not delete the persistent Reticulum data unless you intentionally want a
new identity.

## 3. Interfaces

The add-on supports:

- AutoInterface
- TCP interfaces
- Internet bootstrap
- RNode / serial interfaces
- Reticulum transport mode

Only enable interfaces you actually intend to use.

### RNode

For an RNode-compatible device:

1. Connect the device to the Home Assistant host.
2. Enable the RNode interface.
3. Select/configure the serial port and radio parameters.
4. Restart the add-on if requested.
5. Verify the RNode and Reticulum state in the Web UI.

Radio parameters must comply with the regulations applicable in your region.

## 4. LXMF Messenger

The integrated Messenger supports:

- persistent local identity
- contact discovery and management
- local aliases
- contact QR codes
- contact import/export
- send and receive
- delivery state
- delivery timestamps
- retry workflow
- path/hop information where available

For a first message test, select a known LXMF contact and send a short test
message. Wait for the delivery state to update.

## 5. Restart and persistence checks

After configuration, test at least once:

1. add-on restart
2. Home Assistant restart
3. host restart when practical

After each restart confirm:

- node returns online
- Reticulum identity is unchanged
- contacts remain available
- configured interfaces remain intact
- LXMF messaging still works

## 6. System check and diagnostics

Before reporting an issue:

1. Open **Messenger → Einstellungen**.
2. Run **Systemcheck → Prüfen**.
3. Use **Diagnose exportieren** when a support snapshot is needed.

The diagnostic export is designed to avoid message bodies, contact names,
passwords and access tokens. Review any file yourself before publishing it.

## 7. Backup and updates

Before development/beta updates:

- create a Home Assistant backup
- keep a known working add-on version available
- do not delete the persistent Reticulum identity
- after updating, rerun the Systemcheck and a short LXMF send/receive test

## 8. Privacy and security

Do not publish:

- Home Assistant access tokens
- API keys
- passwords
- private Home Assistant URLs
- private network credentials
- private Reticulum identity material

N2K RNS Gateway is intended to operate locally and does not require exposing
its Web UI directly to the public Internet.

## 9. Troubleshooting

### Node offline

Check:

- configured Reticulum interfaces
- serial/RNode device presence
- TCP target availability if using TCP
- add-on log
- Systemcheck result

### RNode not detected

Check:

- USB passthrough/device availability
- selected serial port
- cable and power
- compatible RNode firmware
- configured radio parameters

### Message not delivered

Check:

- destination/contact hash
- Reticulum path availability
- peer reachability/path information
- outbox delivery state
- retry function
- whether the remote node is currently reachable

### Update appears not to change the UI

Restart the updated add-on and hard-refresh/reload the Home Assistant Web UI
to clear cached frontend content.

## 10A. Home Assistant automation

The add-on publishes N2K state directly into Home Assistant.

Important entities include:

- `binary_sensor.n2k_reticulum_online`
- `binary_sensor.n2k_rnode_online`
- `binary_sensor.n2k_lxmf_ready`
- `sensor.n2k_rnode_noise_floor`
- `sensor.n2k_lxmf_unread`
- `sensor.n2k_store_forward_status`

Available actions:

- `n2k.send_message`
- `n2k.send_announce`
- `n2k.refresh_status`

Available automation events include:

- `n2k_status_changed`
- `n2k_lxmf_message_received`
- `n2k_control_result`
- `n2k_lxmf_command`

The secure LXMF → Home Assistant command bridge is disabled by default and only accepts explicitly trusted source hashes.

See [Systemhandbuch](SYSTEMHANDBUCH.md) for architecture, configuration, security model and complete examples.

## 10. Demo Mode

The left navigation contains **Demo Mode**, a privacy-safe social showcase.

Demo Mode runs a narrator-synchronized ≥3:47 scripted presentation explaining:

- why local-first communication is useful
- how N2K RNS Gateway evolved
- Reticulum identities, paths and transport
- LXMF messaging and Store & Forward
- Living Mesh
- RNode / LoRa
- monitoring
- Home Assistant sensors, events and N2K actions
- secure LXMF → Home Assistant command events
- project goals and contribution options

### Privacy

Demo Mode uses synthetic presentation data only. It does not read message
contents, contact names or destination hashes.

### Recording controls

- **Start / Pause**
- **Next scene**
- **Restart**
- **Narrator** — optional browser speech synthesis
- **CC subtitles** — high-contrast in-video subtitles
- **Capture Mode** — hides navigation and surrounding UI
- **Fullscreen**
- **9:16 / 1:1 / 16:9** layouts

Browser narration depends on the voices provided by the browser/operating
system. For consistent published audio, use the documented narration script as
a source for a dedicated TTS or recorded voice track.

See [Demo Mode & social capture](DEMO_MODE.md).

## 11. About and licensing

The Web UI contains an integrated **About** section identifying:

- project: **N2K RNS Gateway DEV**
- developer: **Netfreak2k**
- function: Reticulum/LXMF gateway for Home Assistant
- independent relationship of Reticulum and LXMF

Project licensing:

- original N2K RNS Gateway code: see `LICENSE`
- third-party components: see `THIRD_PARTY_NOTICES.md`

N2K RNS Gateway is not an official Home Assistant, Reticulum or LXMF product.
