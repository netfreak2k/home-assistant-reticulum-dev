# Changelog

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
