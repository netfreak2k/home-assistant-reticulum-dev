# N2K RNS Gateway — Beta Tester Guide

## Goal

The purpose of the public beta is to validate N2K RNS Gateway on Home
Assistant installations beyond the original development system.

## Installation

Add this repository to the Home Assistant Add-on Store:

https://github.com/netfreak2k/home-assistant-reticulum-dev

Install:

**N2K RNS Gateway DEV**

Then start the add-on and open the Web UI.

## Required first check

Open:

Messenger → Einstellungen → Systemcheck

Press:

**Prüfen**

Expected software baseline:

- Persistente Identity — PASS
- Kontaktspeicher — PASS
- LXMF Inbox — PASS
- LXMF Outbox — PASS
- Reticulum Stack — PASS

RNode / Serial may show OPTIONAL when no RNode is configured.

## Recommended test sequence

### 1. Restart

Restart the N2K RNS Gateway add-on.

Verify:

- Web UI loads
- Identity remains unchanged
- contacts remain available
- Systemcheck remains PASS

### 2. Messaging

Send a test LXMF message.

Verify:

- message appears in the conversation
- delivery state is visible
- delivery updates automatically when available
- failed messages can use Retry

### 3. Contacts

Verify:

- create/edit local alias
- contact opens the correct chat
- QR contact export works
- contact export/import works if used

### 4. Network information

Verify where applicable:

- known path
- hop count
- transport/interface
- peer reachability
- queue/path warning

### 5. Diagnostics

Run:

Messenger → Einstellungen → Diagnose exportieren

Verify that a JSON file downloads.

Do not publicly post sensitive credentials.

### 6. Demo Mode

Open **Demo Mode** from the navigation.

Verify:

- the 2:30 story starts and advances through all 15 chapters
- Start/Pause, Next and Restart work
- 9:16, 1:1 and 16:9 layouts work
- subtitles remain readable
- optional narrator can be enabled/disabled
- Capture Mode hides app chrome and enters a clean recording view
- leaving Demo Mode stops narration and playback
- no real contact names or message contents appear

## What to report

Please include:

- N2K RNS Gateway version
- Home Assistant version
- installation architecture (`amd64` or `aarch64`)
- interface type in use:
  - AutoInterface
  - TCP
  - RNode / Serial
- Systemcheck result
- exact steps to reproduce the issue
- what you expected
- what actually happened
- diagnostic export when useful

Screenshots are helpful when they do not expose private information.

## Known unverified area

The current public beta has not yet completed the original on-site physical
RNode USB disconnect/reconnect validation.

This means the following is still explicitly unverified in the original
test environment:

- physically unplugging the RNode
- reconnecting it
- automatic recovery after reconnect

RNode operation itself has already been detected and used in the development
environment.

## Important

This is beta software.

Keep a backup before testing development updates.

N2K RNS Gateway is an independent third-party project and is not an official
Home Assistant, Reticulum or LXMF product.
