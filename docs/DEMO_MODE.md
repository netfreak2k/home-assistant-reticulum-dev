# N2K RNS Gateway — Demo Mode & Social Capture

## Purpose

Demo Mode is a built-in 2 minute 30 second social-media presentation for
explaining N2K RNS Gateway, Reticulum and LXMF to people who may have no prior
mesh-network knowledge.

It is designed for screen recording in:

- 9:16 — Reels / TikTok / Shorts
- 1:1 — square social posts
- 16:9 — desktop / YouTube / presentations

## Story structure

The current production story contains 15 chapters with variable pacing and a
total runtime of exactly 150 seconds:

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
13. Development workflow
14. Project goals
15. Community call-to-action

## Recording workflow

1. Open **Demo Mode**.
2. Choose **9:16**, **1:1** or **16:9**.
3. Decide whether browser narration should be enabled.
4. Keep **CC subtitles** enabled for social platforms where videos may autoplay muted.
5. Press **Capture Mode**.
6. Start the screen recorder.
7. Press **Restart** if you need the story from frame zero.
8. Record the full 02:30 sequence.

Capture Mode hides navigation, page headers, controls and the external scene
caption. The in-video subtitles and N2K watermark stay visible.

## Narration

The optional narrator uses the browser Web Speech API (speech synthesis) and
selects a German voice where possible.

Important:

- voice availability differs between browsers and operating systems
- browser TTS is convenient for previews, but not deterministic
- for a final published video, a dedicated recorded/TTS voice track is recommended

The canonical narration text lives in the Demo Mode scene definitions in:

reticulum_dev/rootfs/opt/reticulum-web/static/messenger.js

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

The story controller, 15-scene order and exact 150-second runtime are unchanged.
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
