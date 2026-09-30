# N2K RNS Gateway — Beta Test Status

Version target:

`1.14.3-dev`

Status:

`PUBLIC BETA PREPARATION · REMOTE VALIDATED`

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

The software stack may continue through beta validation without the
physical USB reconnect test.

The following limitation remains explicitly unverified:

- physical RNode USB disconnect
- physical RNode USB reconnect
- automatic RNode recovery after reconnect

This does not block remote software beta testing.

Feature freeze remains active.

Allowed:

- bug fixes
- compatibility fixes
- documentation
- licensing corrections
- stability improvements
- diagnostic improvements

Not allowed during feature freeze:

- major UI redesign
- new messaging architecture
- major protocol features
