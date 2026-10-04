# N2K RNS Gateway 1.30.49-beta1

## Demo Mode production pass

This release turns Demo Mode into a production-oriented 2:30 social story.

### Added

- variable scene timing with an exact total runtime of 150 seconds
- five-second opening hook
- high-contrast in-video subtitles
- optional German browser narration via the Web Speech API
- Capture Mode for clean screen recording
- cinematic scene transitions
- preserved 9:16, 1:1 and 16:9 aspect ratios in fullscreen capture
- stronger community call-to-action
- improved contrast and mobile readability

### Privacy

Demo Mode remains synthetic-only.

It does not read real:

- message contents
- contact names
- destination hashes
- messenger conversations

The Demo Mode controller performs no messenger/network API requests and does not
send messages, trigger announces or modify Reticulum/RNode configuration.

### Documentation

- README refreshed for the current 1.30.x beta
- Demo Mode guide added
- CONTRIBUTING.md added
- User Guide updated
- Beta Tester Guide updated
- Changelog updated

### Recording recommendation

For social clips, keep subtitles enabled and select the target format before
entering Capture Mode. Browser narration is useful for previews; for a final
published video, a dedicated recorded or deterministic TTS track is recommended.
