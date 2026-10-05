# N2K RNS Gateway DEV 1.30.54-beta1

## Home Assistant Native Entity Bridge

This release makes N2K RNS Gateway directly useful in Home Assistant automations.

### New entities

- binary_sensor.n2k_reticulum_online
- binary_sensor.n2k_rnode_online
- binary_sensor.n2k_lxmf_ready
- sensor.n2k_reticulum_interfaces
- sensor.n2k_internet_peers
- sensor.n2k_rnode_noise_floor
- sensor.n2k_rnode_airtime_15s
- sensor.n2k_lxmf_conversations
- sensor.n2k_lxmf_unread
- sensor.n2k_lxmf_inbox
- sensor.n2k_lxmf_outbox
- sensor.n2k_store_forward_status

The existing sensor.reticulum_status remains available for compatibility.

### Automation events

- n2k_status_changed
- n2k_lxmf_message_received

The LXMF receive event contains only counters. It does not expose message bodies or contact identities.

### Runtime

The add-on publishes the states through the Home Assistant Core API every 15 seconds.

### Demo freeze

The approved 1.30.53-beta1 Demo/Stream implementation remains functionally unchanged. The frozen snapshot remains available on branch:

frozen/1.30.53-beta1
