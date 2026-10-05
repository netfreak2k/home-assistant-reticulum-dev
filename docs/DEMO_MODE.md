# N2K RNS Gateway — Demo Mode & Social Capture

## Purpose

Demo Mode is a built-in approximately 3 minute 47 second social-media presentation for
explaining N2K RNS Gateway, Reticulum and LXMF to people who may have no prior
mesh-network knowledge.

It is designed for screen recording in:

- 9:16 — Reels / TikTok / Shorts
- 1:1 — square social posts
- 16:9 — desktop / YouTube / presentations

## N2K Mesh Plaza

Version 1.30.58-beta1 turns Demo Mode into a continuous **N2K Mesh Plaza** stream loop: a living digital meeting place built around Reticulum, LXMF and Home Assistant.

The background is no longer static. Every scene changes the behaviour of a common animated Reticulum environment:

- flowing Reticulum routes
- moving signal packets
- pulsing mesh nodes
- floating RNS/LXMF/Home Assistant broadcast panels
- continuous N2K Mesh Plaza ticker
- scene-specific motion, brightness and routing behaviour

Scene examples:

- **Local First:** nodes visually gather and connect
- **Reticulum Paths:** routes flow faster and become more visible
- **Transport:** LoRa, LAN, TCP and backbone routes use distinct accents
- **LXMF:** message packets dominate the background
- **Living Mesh:** strongest cinematic movement and route activity
- **RNode:** faster radio-like node pulsing
- **Store & Forward:** packet movement pauses and resumes
- **Monitoring:** denser status-wall activity
- **Home Assistant:** the HA broadcast panel and event flow move forward visually
- **Secure LXMF → HA:** the trusted-event side is emphasized
- **Development:** a stepped cyclic motion represents build/test/fix/push
- **Finale:** all plaza layers become active together as the digital Mesh meeting place

The concept is an original tribute to the idea of participatory network television and a shared digital plaza. The implementation uses its own N2K visual language, graphics and animations.

The visual layer remains synthetic-only and never consumes live chats, contacts or Home Assistant event payloads.

## Story structure

The current production story contains 17 chapters with variable pacing and a narrator-safe minimum runtime of 227 seconds:

1. Hook — what happens when the network disappears?
2. Why local-first communication?
3. Project origin and evolution
4. Reticulum: identities and paths
5. Reticulum: LoRa, LAN and Internet transports
6. LXMF messaging
7. N2K RNS Gateway architecture
8. Living Mesh
9. RNode and LoRa
10. Privacy-safe Messenger
11. Store & Forward / Propagation Nodes
12. Monitoring
13. Home Assistant automation bridge
14. Secure LXMF → Home Assistant commands
15. Development workflow
16. Project goals
17. Community call-to-action

## Recording workflow

1. Open **Demo Mode**.
2. Choose **9:16**, **1:1** or **16:9**.
3. Browser narration is enabled by default; disable it only if you want a silent capture.
4. CC subtitles are disabled by default. Enable them manually when you want a muted-feed version.
5. Press **Capture Mode**.
6. Start the screen recorder.
7. Press **Restart** if you need the story from frame zero.
8. Record the full ≥ 03:47 sequence.

Capture Mode hides navigation, page headers, controls and the external scene
caption. The in-video subtitles and N2K watermark stay visible.

## Narrator-safe pacing

Version 1.30.53-beta1 lengthens scene timing from 150 to 198 seconds.
Each scene now includes enough headroom for the existing German narration at a calm browser-TTS pace plus a short visual pause before the next scene.
The runtime display is derived from the scene table instead of being hard-coded, so future timing changes stay consistent automatically.

## Stream brightness

Version 1.30.53-beta1 brightens the Demo Mode specifically for live streaming and compressed video platforms such as Twitch, YouTube, TikTok and Reels. The stage now uses brighter blue/teal ambient light, stronger route glow, more visible cards and livelier moving light sources while preserving dark enough text surfaces for readability.

The change is visual only: narration synchronization, scene timing, privacy behavior and capture formats are unchanged.

## Speech synchronization

Starting with 1.30.53-beta1, scene changes are no longer allowed to interrupt active speech. The controller waits for the browser speech engine to report that narration has finished, then keeps the current visual on screen for an additional short tail before transitioning. The displayed total runtime is therefore a minimum (≥ 03:18) because installed voices and browsers speak at slightly different speeds.

Default state:

- speaker: ON
- subtitles: OFF

## Narration

The optional narrator uses the browser Web Speech API (speech synthesis) and
selects a German voice where possible.

Important:

- voice availability differs between browsers and operating systems
- browser TTS is convenient for previews, but not deterministic
- for a final published video, a dedicated recorded/TTS voice track is recommended

The canonical narration text lives in the Demo Mode scene definitions in:

reticulum_dev/rootfs/opt/reticulum-web/static/messenger.js

## Home Assistant chapters

Version 1.30.58-beta1 adds two synthetic chapters to explain the native Home Assistant bridge.

### Home Assistant automation

The demo explains that N2K publishes Reticulum, RNode and LXMF state into Home Assistant as sensors and events. It also shows that Home Assistant can trigger N2K actions such as LXMF messaging, announce and status refresh.

### Secure LXMF → Home Assistant

The demo shows the fixed command model:

- `!HA STATUS`
- `!HA RUN LIGHT_ON`
- explicit sender whitelist
- sanitized `n2k_lxmf_command` event

The scene deliberately does not demonstrate arbitrary services, entity IDs or free-form code. Home Assistant remains the local policy and execution layer.

Both chapters use synthetic values only. The Demo Mode does not read live Home Assistant entities or real LXMF commands.

## Privacy model

Demo Mode is intentionally **synthetic-only**.

The Demo Mode controller:

- does not call the messenger API
- does not read real conversations
- does not read contact names
- does not read destination hashes
- does not show real message bodies
- does not send messages or announces
- does not change Reticulum or RNode configuration

Real incoming LXMF traffic cannot be rendered into the Social Demo scenes.

This separation is intentional: a screen recording should remain safe even if
real messages arrive while the demo is running.

## Readability and accessibility

The production pass uses:

- high-contrast text
- dark translucent text panels
- larger subtitles
- text shadows for busy animated backgrounds
- prefers-contrast: more support
- prefers-reduced-motion: reduce support

For public posts, keep subtitles enabled because many social feeds autoplay without audio.

## 1.30.50 production readability pass

The social capture UI now deliberately prioritizes legibility over decorative density:

- secondary text uses brighter neutral tones instead of low-opacity grey
- small labels and card copy are larger
- subtitles use a darker, more opaque panel and larger type
- animated scenes use stronger text shadows and dark content surfaces
- 9:16 mode receives dedicated portrait typography overrides
- high-contrast OS/browser preferences receive an additional contrast boost

The visual design and narrator-synchronization controller remain unchanged; the story now contains 17 scenes; runtime is now 227 seconds so narration can finish naturally.
This means existing recording workflows remain compatible while compressed TikTok,
Reels and Shorts playback is easier to read.

## Community / how to participate

Useful contributions include:

- installing the beta on another Home Assistant system
- testing AutoInterface, TCP and RNode configurations
- testing different RNode-compatible hardware
- reporting UI/mobile/browser issues
- testing Store & Forward behaviour
- reporting accessibility/readability problems
- proposing new Demo Mode scenes
- translating documentation or UI text
- submitting code improvements

Repository:

https://github.com/netfreak2k/home-assistant-reticulum-dev

Before sharing screenshots, logs or diagnostics publicly, review them for
private URLs, tokens, credentials and network details.
