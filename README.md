# N2K RNS Gateway DEV for Home Assistant

Development repository for the N2K RNS Gateway Home Assistant add-on.

N2K RNS Gateway connects Home Assistant with the Reticulum Network Stack
and LXMF messaging.

## Development status

**1.14.0-dev · Beta Candidate**

The core Reticulum/LXMF gateway and messenger workflow has passed the
remote beta acceptance test.

Feature development is temporarily frozen while stability and hardware
reconnect behaviour are validated.

### Verified

- Add-on restart
- Persistent Reticulum identity
- Persistent contacts
- Reticulum stack availability
- LXMF send
- Delivery status
- Retry workflow
- Integrated system self-test

### Pending on-site verification

- Physical RNode / USB disconnect and reconnect test


## Core functions

- Reticulum Network Stack integration
- LXMF messaging
- Persistent Reticulum identity
- Contact management
- Delivery status
- Reticulum path and hop information
- RNode / serial support
- TCP and AutoInterface support
- Home Assistant Ingress UI

## Licensing

N2K RNS Gateway contains original Netfreak2k code and third-party software.

See:

- `LICENSE`
- `THIRD_PARTY_NOTICES.md`

Reticulum and LXMF are independent third-party projects and are not owned
or maintained by Netfreak2k.

## Stable repository

https://github.com/netfreak2k/home-assistant-reticulum
