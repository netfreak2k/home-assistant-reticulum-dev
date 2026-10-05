# Changelog

## 1.30.54-beta1 — Home Assistant Native Entity Bridge

### Home Assistant

- Publish 12 N2K entities directly to Home Assistant every 15 seconds.
- Add connectivity binary sensors for Reticulum, RNode and LXMF readiness.
- Add RNode noise-floor and airtime sensors.
- Add LXMF conversation, unread, inbox and outbox counters.
- Add Store & Forward status and Reticulum interface/internet peer sensors.
- Fire `n2k_status_changed` when core connectivity state changes.
- Fire privacy-safe `n2k_lxmf_message_received` when the inbox count increases; no message body or contact identity is exposed.
- Keep the legacy `sensor.reticulum_status` for compatibility.
- Demo/stream baseline remains visually and behaviorally unchanged from the frozen 1.30.53-beta1 snapshot.

## 1.30.53-beta1 — Brighter Stream Demo

### Freeze status

- FROZEN: approved Demo/Stream baseline.
- No further changes to Demo visuals, narration defaults, speech synchronization, scene timing or stream brightness inside 1.30.53-beta1.
- Future Demo changes require a new version.

### Demo Mode

- Brighten the entire Demo stage for Twitch, YouTube and live-stream capture.
- Add stronger blue, teal and warm ambient light without washing out text.
- Increase mesh route glow and particle visibility.
- Add moving ambient light orbs for a more lively stream presentation.
- Lift card surfaces and borders so UI elements survive video compression better.
- Keep narration synchronization, default speaker/subtitle state and privacy behavior unchanged.

## 1.30.52-beta1 — Speech-synchronized Demo Mode

### Demo Mode

- Enable the German speaker by default.
- Disable subtitles by default.
- Stop using scene duration as a hard cut-off for narration.
- Wait until the browser speech engine finishes before advancing to the next scene.
- Add a 0.9 second visual tail after narration before the cinematic transition.
- Slow narration slightly from 0.94 to 0.92 for more natural delivery.
- Show the scripted runtime as a minimum (≥ 03:18), since actual browser voices can vary in duration.

## 1.30.51-beta1 — Narrator-safe Demo Timing

### Demo Mode

- Extend the Social Demo from 150 to 198 seconds (about 3:18).
- Give every scene enough time for the existing German narration to finish naturally.
- Add breathing room after spoken lines instead of cutting directly into the next scene.
- Make the runtime display derive from the scene durations instead of a hard-coded 02:30 label.
- Preserve the existing 15-scene story, visuals, privacy model and capture formats.

## 1.30.50-beta1 — Social Demo Readability & Contrast

### Demo Mode

- Raise contrast for secondary copy, badges, controls, cards and scene labels.
- Increase small-text sizes that were difficult to read in screen recordings and compressed social feeds.
- Strengthen subtitle panels for muted autoplay viewing.
- Improve 9:16 portrait typography without changing the 2:30 timing or scene controller.
- Add stronger text shadows and dark content surfaces so animated mesh backgrounds do not compete with copy.
- Preserve the existing 15-chapter story, cinematic transitions, privacy-safe synthetic data and capture layouts.

### Release hygiene

- Bump add-on and frontend cache version to 1.30.50-beta1 so Home Assistant receives the updated assets.
- Update README, Demo Mode documentation, add-on changelog and release notes.

## 1.30.49-beta1 — Demo Mode Production Pass

### Demo Mode

- Expand the 2:30 Social Story into a production-oriented capture workflow.
- Use variable scene timing while keeping the total runtime at exactly 150 seconds.
- Add a stronger five-second opening hook.
- Add high-contrast in-video subtitles.
- Add optional browser speech synthesis for the scripted German narration.
- Add Capture Mode that hides navigation, controls and surrounding UI for recording.
- Keep 9:16, 1:1 and 16:9 output layouts.
- Add cinematic transition overlays between scenes.
- Improve mobile readability, contrast and high-contrast accessibility support.
- Strengthen the final community call-to-action.

### Privacy

- Demo Mode remains synthetic-only.
- Demo Mode does not fetch messenger data, contacts or destination hashes.
- Real incoming LXMF messages cannot be exposed by the Social Demo controller.

### Documentation

- Add dedicated Demo Mode and social capture documentation.
- Add CONTRIBUTING.md with testing, hardware and privacy guidance.
- Update README, User Guide and Beta Tester Guide for the current 1.30.x feature set.
- Replace the outdated feature-freeze wording with active beta development guidance.

## 1.30.21-beta1

- Remove the four repeated status cards from the overview; keep RNS, LXMF and NODE in the header and detailed status on the Status page.
- Align visible app version labels and cache key with the DEV add-on version.

## 1.30.20-beta1
- Modern responsive overview with readable service cards, compact mesh counters and larger telemetry.
- Fix overlapping full-height mesh counters caused by conflicting top and bottom positions.

## 1.30.13-beta1

- Batch LXMF contact-cache writes during announce bursts, skip unchanged contacts and cap last-seen persistence to one update per peer every 30 seconds.
- Serialize contact/debug file updates and replace shared temporary filenames to prevent concurrent announce handlers from losing writes.
- Replace one log line per contact with a periodic announce summary.

## 1.30.12-beta1

- Prevent simultaneous web requests from launching duplicate status and network diagnostics when the cached snapshot expires.

## 1.30.11-beta1

- Open saved contacts directly in the Chat conversation and synchronize the selected recipient across both chat implementations.
- Keep the conversation and composer visible during delayed page refreshes and layout repairs, including contacts without message history.
- Return to the chat list when using Back or selecting Chat navigation.

## 1.30.10-beta1

- Store manually saved contacts independently from the node's announce cache so network discovery cannot overwrite them.
- Migrate existing manual contacts and merge their aliases into contact and chat API responses.
- Route contact refreshes through one renderer so search, Saved and Favorites filters remain consistent after adding or importing contacts.
- After adding a contact, show it directly in Saved using its address as the search term.

## 1.30.9-beta1

- Integrate the active node name into the existing colored status indicator in the top header; remove the extra name row.
- Preserve the original status text and color updates while displaying the name beside the status dot.
- Keep full names in the tooltip; constrain long names on phones and support keyboard access to Settings.

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

# Changelog

## 1.18.6-beta1 — Public Beta Baseline

### Status

Public beta baseline after successful validation.

PASS:

- Home Assistant add-on installation
- clean installation on a second Home Assistant system
- add-on restart
- persistent Reticulum identity
- Reticulum node online
- LXMF send and delivery state
- contacts and local aliases
- QR contact generation through Home Assistant Ingress
- update workflow
- MCP server connectivity
- integrated self-test
- diagnostics export
- documentation and licensing review
- backup / rollback baseline

### QR fix

The contact QR endpoint now uses POST + JSON through Home Assistant Ingress and
renders the locally generated SVG inline in the UI. This avoids the previous
blank QR field / HTTP 400 failure.

### Development policy

Feature freeze remains active for beta stabilization. New work should be
limited to bug fixes, compatibility fixes, diagnostics and documentation.

## 1.14.4-dev — Beta Tester Onboarding

### Documentation

- 60-second beta tester quick start
- Dedicated beta tester guide
- Recommended validation sequence
- Bug reporting checklist
- Privacy reminders for external testers

### Status

No core functionality changed.

Feature freeze remains active.


## 1.14.3-dev — Public Beta Preparation

### Documentation

- Public beta installation instructions
- Requirements documentation
- Beta limitations
- Privacy guidance
- Problem-reporting guidance
- Public beta checklist
- Public beta release text

### Status

Core software remains feature frozen.

Remote software validation remains PASS.

Physical RNode USB disconnect/reconnect recovery remains UNVERIFIED.


## 1.14.2-dev — Beta 3 Hardening

### Added

- Privacy-conscious diagnostic export
- Integrated support snapshot
- Redacted Reticulum identity hashes
- Network and RNode configuration summary

### Privacy

The support export does not include:

- message contents
- contact names
- message history
- passwords
- tokens

### Status

Feature freeze remains active.


## 1.14.1-dev — Beta 2

### Status

Remote software validation complete.

The physical RNode USB reconnect test remains unverified because no
on-site access is currently available.

This limitation does not block continued beta testing of the software
stack.

### Validation state

PASS:

- Add-on restart
- Persistent identity
- Contacts persistence
- Reticulum stack
- LXMF send
- Delivery status
- Retry workflow
- Integrated self-test

UNVERIFIED:

- Physical RNode USB disconnect
- Physical RNode USB reconnect
- Automatic recovery after reconnect

### Development policy

Feature freeze remains active.


## 1.14.0-dev — Beta Candidate

### Status

Beta candidate after successful remote acceptance testing.

### Added during the current development cycle

- Persistent Reticulum identity
- LXMF messaging
- Delivery state tracking
- Delivery timestamp
- Automatic delivery refresh
- Peer reachability information
- Flat modern messenger interface
- Chat search
- Unread state
- Local contact aliases
- Message detail view
- Retry workflow
- Reticulum path information
- Hop and transport information
- Queue/path warnings
- Contacts management
- Contact import/export
- Contact QR codes
- Ingress-safe QR loading
- N2K RNS Gateway branding
- About and licensing information
- Retro-modern header
- Live digital clock and date
- Integrated system self-test

### Remote beta acceptance

PASS:

- Add-on restart
- Persistent identity
- Contacts retained after restart
- Reticulum stack
- LXMF send
- Delivery status
- Retry
- Self-test after restart

### Pending

- Physical RNode / USB disconnect and reconnect test on site

### Feature freeze

No major features should be added until the pending hardware reconnect
test has been completed or a blocking defect requires a fix.
