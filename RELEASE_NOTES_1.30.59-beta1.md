# N2K RNS Gateway DEV 1.30.59-beta1

## TV Safe Broadcast Loop

This release prepares N2K Mesh Plaza for long-running studio, stream and television-style presentation.

### TV SAFE

A new TV SAFE control:

- forces wide presentation
- starts the loop automatically
- attempts fullscreen
- hides app navigation, page headers, demo controls and metadata
- keeps the N2K watermark
- keeps optional subtitles
- leaves narration synchronization intact

### Seamless loop

The transition from scene 17 back to scene 1 now uses a soft visual wash so the presentation feels continuous instead of restarting abruptly.

### Dynamic broadcast ticker

The Mesh Plaza ticker rotates synthetic messages such as:

- RNS PATH LEARNED
- LXMF DELIVERED
- RNODE ACTIVE
- HA EVENT
- STORE & FORWARD READY
- ROUTE DISCOVERED
- ANNOUNCE SEEN
- MESH PRESENCE

### Synthetic plaza presence

Small animated presence points now appear around the Mesh Plaza.

They are generated locally and are purely abstract. They do not represent real users, contacts, messages, nodes or Home Assistant entities.

### Preserved behaviour

- 17 scenes
- 227 second nominal minimum runtime
- speaker ON by default
- subtitles OFF by default
- narrator-safe scene changes
- privacy-safe synthetic demo data
- scene-specific Mesh Plaza animation
