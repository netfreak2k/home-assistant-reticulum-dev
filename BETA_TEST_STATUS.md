# N2K RNS Gateway — Beta Test Status

Version target:

`1.14.0-dev`

Status:

`BETA CANDIDATE`

## Remote acceptance test

| Test | Result |
|---|---|
| Add-on restart | PASS |
| Persistent Reticulum identity | PASS |
| Contacts persistence | PASS |
| Reticulum stack | PASS |
| LXMF send | PASS |
| Delivery status | PASS |
| Retry workflow | PASS |
| Integrated self-test after restart | PASS |

## Hardware acceptance

| Test | Result |
|---|---|
| RNode detected | PASS |
| Physical USB disconnect | PENDING |
| Physical USB reconnect | PENDING |
| Automatic recovery after reconnect | PENDING |

The physical RNode reconnect test is deferred because the development
system is currently being accessed remotely.

## Release rule

Major feature development is frozen for this beta candidate.

Allowed before the next beta/stable release:

- bug fixes
- compatibility fixes
- documentation
- licensing corrections
- stability improvements
- hardware reconnect fixes if required

Not planned before hardware acceptance:

- major UI redesign
- new messaging architecture
- new protocol features
