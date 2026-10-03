## 1.30.8-beta1

- Verify that the own-name change is persisted in Supervisor options before confirming success.
- Apply the saved name to the running LXMF destination and state without an add-on restart; retain the identity and destination address.
- Announce the updated name automatically while respecting the announce cooldown, and refresh the header after applying it.
- Prevent profile refreshes from replacing an edited or saving name field; report save and apply outcomes separately.

## 1.30.7-beta1

- Show the running node's LXMF display name in the global status header on desktop and mobile.
- Clicking the name opens Settings. Refresh the name from node identity on load, every 30 seconds and when returning to the app.
- Keep the active name until restart; do not present an unsaved or pending configuration name as the running identity.

## 1.30.6-beta1

- Fix the hidden own-name form: load and mount the messenger profile on the unified Settings page on desktop and mobile.
- Label the field Own display name and associate its input with the label.
- Keep the existing profile save and announce APIs; saving reports the required add-on restart.

## 1.30.5-beta1

- Search all contacts by name, alias or LXMF address before paginating the results.
- Add All, Saved and Favorites filters; display saved contacts and accessible favorite buttons in separate rows.
- Preserve saved-contact metadata across incoming announces. Favorites use the existing browser storage.
- Add a visible LXMF Announce action to Contacts, with queue feedback, error handling and cooldown.

## 1.30.4-beta1

- Add original CC0 SVG line icons for radio, mesh, chat, contacts, status, setup and navigation.
- Replace interface emoji/glyph icons with consistent local artwork; message emojis remain unchanged.
- Document icon licensing in ICONS_LICENSE.md and the in-app license panel.

## 1.30.3-beta1

- Keep the full mobile header claim: OFFGRID · MESH · LOCAL INTELLIGENCE.
- Allow the brand line to wrap on narrow phones instead of shortening or clipping it.

## 1.30.2-beta1

- Show propagation status in the overview without substituting an unrelated Internet-interface status.
- Track LXMF propagation transfer completion and asynchronous failures instead of leaving the runtime at REQUESTED.
- Show the selected propagation server immediately, including when automatic retrieval is disabled.
- Separate last retrieval attempt from last confirmed successful retrieval; show received message count when LXMF reports it.
- Do not start overlapping scheduled retrievals while the LXMF transfer is in progress.
- Label selection hops and last-announced hops explicitly instead of presenting them as identical measurements.

## 1.30.1-beta1

- Align the mobile header and all page sections on a shared centered content axis.
- Use border-box sizing and remove nested horizontal padding to prevent right-edge overflow.
- Apply symmetric iOS safe-area gutters and preserve bottom-navigation clearance.
- Desktop layout, controls and backend unchanged.

## 1.30.0-beta1

- Add the Funk-Terminal theme across desktop and mobile: graphite panels, restrained amber accents and mint live indicators.
- Restyle overview, navigation, chat, contacts, status, setup and diagnostics while retaining the responsive layout.
- Use a local grid backdrop and system monospace fonts for diagnostic values; no external font or image requests.
- Keep warning/error/delivery status semantics and all existing controls and backend behavior.
- Add visible keyboard focus outlines and respect reduced motion for decorative radio/header animation.

## 1.29.1-beta1

- Mobile RNode setup and diagnostics use full-width cards; USB paths wrap and diagnostic line breaks remain readable.
- Network statistics wrap into two columns; Living Mesh and its controls fit phone widths.
- Reduce mobile header height and reserve bottom navigation space in the content container.
- Show three live activity entries with an expandable remainder on phones.
- Collapse the duplicate beginner quick guide while preserving all steps and the setup assistant.
- Compact handbook accordions. Backend, radio settings and messaging APIs unchanged.

## 1.21.58-beta1

- Fix contact renaming persistence.
- Store user-defined contact names as manual aliases.
- Preserve the remote peer's announced name separately as announced_name.
- Prevent LXMF announces and cache scans from overwriting manual contact aliases.
- Allow clearing an alias to fall back to the last announced name.
- Refresh chat header, chat list and contact list immediately after renaming.

## 1.21.57-beta1

- Rework Status for first-time users while preserving the existing working backend and controls.
- Add a beginner Quick Start guide with five plain-language setup steps.
- Add a dynamic "What should I do next?" widget that points to the correct next action.
- Add a graphical RNode / LoRa live-status widget with mirrored telemetry and utilization bars.
- Expand the Setup Assistant from four to five stages, including Identity & Messenger.
- Add beginner explanations to the RNode Setup area without changing existing IDs or RNode logic.
- Add a local "terms explained simply" glossary for RNode, RNS, LXMF, Identity, Announce and Store & Forward.
- Keep technical details and diagnostics available for advanced users.
- No backend, API, RNode, Store & Forward or messaging behavior changes.

## 1.21.56-beta1

- Fix the RNode self-test so configured USB is not mistaken for a live RNode interface.
- Require a real RNodeInterface with status Up/Online/Connected for PASS.
- Include the generated managed RNode config block in support diagnostics.
- Include relevant rnsd startup lines in support diagnostics.
- Preserve the Status & Setup 2.0 UI and current runtime behavior.

## 1.21.55-beta1

- Fix an HAOS USB startup race for RNodeInterface.
- Wait up to 20 seconds for the configured RNode serial device to appear before starting rnsd.
- Resolve the stable /dev/serial/by-id path to the concrete tty device after it becomes available.
- Keep the stable by-id path stored in Home Assistant options.
- Add the official RNodeInterface flow_control = false default.
- Preserve the Status & Setup 2.0 UI and existing RNode auto-configuration logic.

## 1.21.54-beta1

- Redesign the complete Status page into a clearer beginner-friendly Status & Setup experience.
- Add a compact gateway overview for RNS, LXMF, RNode and active interfaces.
- Add a four-step Setup Assistant with automatic progress state.
- Rename and simplify the RNode area into a guided "RNode Setup".
- Add jump navigation to RNode Setup, Store & Forward, Systemcheck and Help.
- Keep all existing IDs, buttons, APIs and backend behavior intact.
- Move expert-only status cards into an optional technical details section.
- Avoid DOM feedback loops by using a calm periodic status sync instead of a mutation observer.

## 1.21.53-beta1

- Fix a critical false-positive in RNode compatibility detection.
- Do not treat rnodeconf exit code 0 alone as proof of a valid RNode.
- Reject known failure output such as "did not respond" and "invalid response".
- Require positive RNode evidence before marking the device RNODE_CONFIRMED.
- Stop automatic activation when the RNode handshake is not actually confirmed.
- Show "NICHT GESTARTET" instead of implying a live interface exists when it does not.

## 1.21.52-beta1

- Prefer the exact serial path that already passed the RNode compatibility probe.
- Fall back to the resolved tty device only when needed.
- Persist rnsd startup output for RNode diagnostics.
- Expose the generated managed RNode config and startup errors through the status API.
- Show the exact RNode startup diagnosis directly in Status when no live interface is detected.

## 1.21.51-beta1

- Explicitly install pyserial 3.5 for Reticulum RNodeInterface support.
- Keep the runtime tty resolution fix from 1.21.50.
- Preserve automatic RNode activation and the N2K EU868 profile.
- No firmware flashing or unrelated backend changes.

## 1.21.50-beta1

- Fix RNode startup when a stable /dev/serial/by-id path is stored.
- Resolve the stable symlink to the actual runtime tty device before starting RNS.
- Validate the resolved character device before writing the managed RNodeInterface block.
- Add explicit startup logging for the generated RNodeInterface configuration.
- Keep the stable by-id path in Home Assistant options while using the resolved tty path at runtime.

## 1.21.49-beta1

- Automatically configure a confirmed RNode after compatibility probing.
- Apply the N2K EU868 profile: 868.100 MHz, 125 kHz, 14 dBm, SF10, CR5.
- Automatically enable the RNode interface and persist the selected serial port.
- Schedule an automatic add-on restart after successful configuration.
- Skip auto-configuration once the expected profile is already active.
- Keep firmware flashing disabled.

## 1.21.48-beta1

- Improve the restored RNode / USB layout in Status.
- Give RNode configuration and setup more horizontal space.
- Prevent long USB serial paths from breaking the layout.
- Separate Live telemetry visually from configuration values.
- Improve step cards, port selection and diagnostic readability.
- Keep all existing backend and USB detection behavior unchanged.

## 1.21.47-beta1

- Restore the full RNode / USB setup block inside the visible Status view.
- Reuse the existing USB detection, serial port selection, probe, inspector and live telemetry logic.
- Keep all existing RNode configuration options in the Home Assistant add-on schema.
- No backend behavior changes.

## 1.21.46-beta1

- Scale the unified Messenger for desktop canvases without changing the mobile layout.
- Increase chat name, preview, metadata and open-conversation text sizes on desktop.
- Increase row and avatar sizes slightly for better readability at normal viewing distance.
- Use more of the available Home Assistant canvas width.
- Keep the current header, navigation and LXMF behavior unchanged.

## 1.21.45-beta1

- Final readability pass for the unified Messenger.
- Increase contrast of previews, metadata, section labels, clock and status.
- Refine row separators and filter clarity without making the UI larger.
- Restyle the load-more control to match the Messenger surface.
- Remove the remaining bottom light divider from the app surface.
- Preserve the stable layout and existing LXMF behavior.

## 1.21.44-beta1

- Increase chat readability with larger names, previews and metadata.
- Increase row height, avatar size and list spacing.
- Strengthen contrast for search, section labels and active conversations.
- Improve readability inside open LXMF conversations and the composer.
- Keep the premium system header while making version, clock and navigation easier to read.
- No DOM restructuring or backend behavior changes.

## 1.21.43-beta1

- Make the unified Chat view more readable with stronger hierarchy, contrast and spacing.
- Add a premium layered system header with subtle depth and glass treatment.
- Split the app title and version into separate visual elements while keeping the canonical title as the version source.
- Improve chat avatars, active conversation highlighting, unread badges and list rhythm.
- Modernize the open conversation header, message area and composer.
- Simplify clock and online-status presentation in the top bar.
- Preserve the stable Chat / Status / Living Mesh navigation and existing LXMF behavior.

## 1.21.42-beta1

- Restore the missing modern Messenger controls in the unified Chat view.
- Add compact + New Contact/Chat action and a small options menu for QR, Export and Import.
- Add All, Unread and Contacts filters without DOM re-parenting.
- Extend the search field across both conversations and contacts.
- Keep the stable Chat/Status/Living Mesh shell and avoid the browser hang from 1.21.40.

## 1.21.41-beta1

- Fix the browser hang introduced by the first unified Chat/Contacts implementation.
- Remove the second DOM re-parenting layer that conflicted with the existing app shell.
- Keep Chat and Contacts visually combined using the existing stable shell.
- Preserve search, chat opening, contacts, Status and Living Mesh.

## 1.21.40-beta1

- Merge Chats and Contacts into one modern **Chat** home.
- Reduce primary navigation to Chat, Status and Living Mesh.
- Add compact messenger header with New Chat (+) and options (⋯).
- Keep search across both conversations and contacts.
- Add compact filters for All, Unread and Contacts.
- Move QR, Export and Import into the small options menu.
- Preserve existing contact storage, QR flow, chat opening and LXMF behavior.

## 1.21.39-beta1

- Restore the chat search field.
- Remove only the obsolete RNS/LXMF/NODE status strip below the compact live header.
- Keep the new header status chips as the single status presentation.
- Preserve the bottom-line cleanup from the previous makeover.

## 1.21.38-beta1

- Replace the DEV label in the visible app branding with the current version number.
- Remove the obsolete chat search row.
- Remove the visible bottom divider/white line from the main app surface.
- Tighten chat spacing and apply a cleaner, calmer surface treatment.

## 1.21.37-beta1

- Compress the main header to reduce vertical dominance.
- Integrate RNS, LXMF and NODE as live status chips beside the app title.
- Bind chip states to the existing live UI status sources without changing backend behavior.
- Add restrained scan/glow animation for a cleaner product-style header.

## 1.21.36-beta1

- Move N2K Mesh Universe out of Contacts into a dedicated **Living Mesh** main view.
- Add Living Mesh as a fourth primary navigation item directly below Status.
- Keep the view available in both desktop and mobile app shells.
- Preserve existing realtime, Live-default and 3D-depth behavior.

## 1.21.35-beta1

- Start N2K Mesh Universe directly in Live mode.
- Add optical 3D depth classes for near, mid and far nodes/routes.
- Increase foreground Core depth and reduce distant-node prominence.
- Add a deeper layered Universe background while preserving realtime Reticulum behavior.

## 1.21.34-beta1

- Add a Reticulum-inspired transport backdrop to N2K Mesh Universe.
- Add subtle propagation rings, faint path-space routing lines and low-density signal particles.
- Add event-driven announce waves around new or refreshed realtime peers.
- Keep all backdrop elements decorative and visually subordinate to real nodes and routes.

## 1.21.33-beta1

- Rebalance realtime Smart Camera framing.
- Keep more Universe context visible when only a few live nodes are present.
- Reduce event zoom intensity and slightly reduce Core visual scale.
- Preserve realtime event focus while avoiding oversized close-ups.

## 1.21.32-beta1

- Replace the timed Showcase loop with always-on realtime cinematic behavior.
- Auto-fit the Universe viewport to currently visible nodes for better use of space.
- Highlight genuinely new or refreshed peers/routes with short event-driven Smart Camera focus.
- Return automatically to the live network overview after each event.
- Keep normal manual node selection and chat interaction unchanged.

## 1.21.31-beta1

- Publish the cinematic N2K Mesh Universe Showcase mode.
- Add Smart Camera, automatic node focus, animated route reveal and event overlays.
- Add a 15-second looping presentation sequence for live demonstrations and social-media capture.
- No backend migration required; existing contacts and nearby data remain the source.

## 1.21.21-beta1

- Desktop finishing pass.
- Use nearly the full Home Assistant browser canvas instead of a narrow centered app column.
- Hide the legacy wide Netfreak2k brand/banner strip on desktop when present.
- Widen the desktop sidebar and main messenger surface.
- Increase desktop chat/list working height while leaving the smartphone layout unchanged.

## 1.21.20-beta1

- Publish the unified desktop browser UI as a newer Home Assistant add-on version.
- No additional functional changes beyond the desktop app-shell update.

## 1.18.7-beta1

- Unify desktop browser and smartphone visual language.
- Use the modern N2K app surface on desktop instead of the legacy dashboard.
- Add a compact desktop sidebar for Chats, Kontakte and Status.
- Keep messenger logic unchanged; only view placement and responsive presentation change.
- Preserve the existing mobile layout below 900 px.

## 1.21.19-beta1

- Live Mesh Map classifies visible Reticulum peers by observed route: **LOCAL RADIO**, **LOCAL NET**, **INTERNET**, **DIRECT** or **UNKNOWN**.
- Internet-routed peers show the observed entry interface/gateway when available.
- Node details include route confidence, hop count, interface and next-hop information.
- The UI deliberately treats gateway/entry information as approximate network origin and does not claim the physical location of the end node.
- Existing chat, scanner, Store & Forward and Reticulum routing behaviour remain unchanged.

## 1.21.11-beta1

- Nearby scanner now listens specifically for canonical `lxmf.delivery` announces and accepts valid path-response announces.
- On startup and every 60 seconds, the node reconstructs LXMF delivery destinations from Reticulum's known-destination cache, so peers learned before the UI scan are not lost.
- Scanner diagnostics now separate **live LXMF**, **cached LXMF** and total **RNS known paths**.
- Existing contacts remain persistent; cache recovery only promotes destinations that cryptographically map to `lxmf.delivery`.

## 1.21.10-beta1

- Umgebungsscanner nutzt jetzt den dauerhaft gepflegten LXMF-Announce-Cache statt nur das 30-Sekunden-Zeitfenster.
- Bekannte LXMF-Peers der letzten 24 Stunden werden sofort angezeigt; neue Announces während des Scans werden separat als **live** markiert.
- Manuell angelegte/importierte Kontakte werden nicht fälschlich als Umgebungstreffer gewertet.
- Anzeige unterscheidet **live**, **bekannt aus Cache** und die Gesamtzahl; 128-Hop-Sentinel wird nicht als echter Hop angezeigt.
- Der Scan bleibt passiv und erzeugt keine zusätzliche Funkübertragung.

## 1.21.8-beta1

- Store & Forward discovery now persists valid inactive `lxmf.propagation` announces instead of discarding them.
- The scanner now distinguishes **known** propagation nodes from **currently active** nodes in the mobile UI.
- Automatic selection remains safety-first: only active nodes are eligible for Store & Forward.
- Reticulum identity-cache recovery now restores inactive valid propagation records as well.
- Known recent propagation nodes are probed again even when their last announce marked them inactive.
- This makes “0 active” diagnosable without losing evidence that propagation servers were actually seen.

## 1.21.7-beta1

- Store & Forward settings now trigger an automatic add-on restart after saving, so the node process immediately receives the new propagation environment.
- Mobile UI reports the restart and reloads automatically instead of leaving the scanner in the misleading “aktiviert / runtime nicht aktiv” state.
- The manual restart fallback remains available when Supervisor self-restart cannot be scheduled.

## 1.21.6-beta1

- Store & Forward scanner now exposes its full discovery pipeline: valid → active → persisted → eligible.
- Added diagnostics for rejected destination hashes, handler errors, last candidate and last scanner stage.
- Candidate API now reports raw discovery-file counts and rejection previews to make zero-result scans debuggable.
- Mobile status UI shows the concrete failure stage instead of only reporting “0 Server gefunden”.

## 1.21.5-beta1

- Propagation-Scanner zeigt jetzt gültige, aktive, inaktive und ungültige LXMF-Propagation-Announces getrennt an.
- Diagnose erklärt bei 0 gefundenen Servern präziser, ob Announces vorhanden sind, aber kein Node aktiv/erreichbar ist.

## 1.21.1-beta1 · Auto Propagation Discovery

- Added passive discovery of valid active `lxmf.propagation` announces.
- Added automatic propagation-node selection ranked by hop count, freshness and stamp cost.
- Added anti-flap behaviour: the current discovered node is retained when it remains fresh and within one hop of the best candidate.
- Added automatic/manual selection mode in the mobile Store & Forward UI.
- Added visible selected-node, hop-count and discovered-candidate status.
- Added `/api/propagation/candidates` for recent discovered propagation nodes.
- Automatic mode no longer requires manually entering a propagation-node hash.
- Automatically selected nodes are used for Store & Forward, auto-sync, message metadata and Systemcheck.
- Auto-discovery is passive and does not emit extra discovery traffic.
- Rollback branch: `backup-1.21.0-beta1-before-auto-propagation`.

## 1.21.0-beta1 · Store & Forward

- Added standards-based **LXMF Propagation / Store & Forward** support without RFed-specific dependencies.
- Direct delivery remains preferred. After the normal direct path attempt, N2K can fall back to `LXMF.LXMessage.PROPAGATED` when a valid propagation node is enabled.
- Added mobile **Store & Forward** configuration under Status: enable/disable, 32-character propagation destination, automatic parked-message retrieval and sync interval.
- Added periodic `request_messages_from_propagation_node()` retrieval for messages parked for the local Identity.
- Added explicit message states: **Store & Forward ⏳**, **am Propagation Node ✓**, direct **zugestellt ✓✓**, and failed.
- Propagation acceptance is deliberately not shown as final recipient delivery.
- Added propagation runtime state to Systemcheck and the Messenger feature-bundle integrity check.
- Propagation configuration is included in the N2K Gateway backup.
- Existing installations keep propagation disabled by default, preserving 1.20.1 direct-delivery behaviour until explicitly configured.
- Rollback branch: `backup-1.20.1-beta1-before-store-forward`.

## 1.20.1-beta1

- Fixed chat flicker after Mesh Photo messages.
- Prevented the legacy 5-second LXMF inbox renderer from overwriting the current Messenger conversation.
- Prevented raw Mesh Photo payload text from temporarily replacing rendered images.
- Added conversation change detection so unchanged chats are no longer fully re-rendered every refresh cycle.
- Existing text, emoji, photo send/receive and delivery-status logic remain unchanged.

## 1.20.0-beta1 · Resilience Core

- Added **Resilience Core** status panel with simplified RNS, LXMF, active-interface and path overview.
- Added a persistent **Notfallmodus** that reduces the Status UI without changing Reticulum/RNode configuration.
- Added full **Gateway Backup** export for persistent Identity, contacts and supported add-on settings; message history is intentionally excluded.
- Added guarded **Backup Restore** with format/size validation, atomic Identity/contact replacement and explicit add-on restart requirement.
- Added clearer outbound message state: queued LXMF messages now show **in Übertragung …**, plus existing delivered/failed states.
- Added guided Systemcheck recovery text with a concrete next step after PASS/FAIL.
- Added runtime feature-bundle integrity check for Scanner, Announce, Mesh Photo, Emoji and Resilience UI.
- Expanded the local handbook for backup/restore and Resilience mode.
- Rollback branch: `backup-1.19.1-beta1-before-resilience-core`.
- Clean-install validation on a second Home Assistant instance remains the final manual release gate.

## 1.19.1-beta1

- Added an in-chat emoji picker next to the photo button.
- Emojis are inserted into the existing text composer at the current cursor position.
- Uses the unchanged LXMF text send/receive path; no protocol changes.
- Includes a compact set of common reactions plus mesh/offgrid-friendly symbols such as 📡, ⚡, 📍, ✅ and ⚠️.

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
