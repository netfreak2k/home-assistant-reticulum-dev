# Contributing to N2K RNS Gateway

Thanks for helping test and improve the project.

N2K RNS Gateway is in active public beta development. Contributions do not
have to be code — hardware tests and reproducible bug reports are especially valuable.

## Good ways to help

- test installation and updates on another Home Assistant system
- test RNode / LoRa hardware
- test AutoInterface and TCP backbones
- test LXMF delivery and Store & Forward
- test desktop and mobile layouts
- test Demo Mode in 9:16, 1:1 and 16:9
- report accessibility or readability issues
- improve documentation
- propose features with a clear use case
- submit focused code changes

## Before opening a bug

Please include:

- N2K RNS Gateway version
- Home Assistant version
- architecture (amd64 / aarch64)
- interface type in use
- exact reproduction steps
- expected result
- actual result
- Systemcheck result
- diagnostic export when useful

## Privacy

Never post:

- passwords
- Home Assistant tokens
- API keys
- private URLs
- private network credentials
- private Reticulum identity material
- private message contents
- contact information without consent

The support diagnostic is designed to redact sensitive messenger data, but
always review a file before uploading it publicly.

## Development principles

Prefer small, testable changes.

For development work:

1. start from the current main
2. create a rollback/reference point before risky changes
3. isolate UI-only changes from Reticulum/LXMF backend changes
4. preserve persistent identity and messenger data
5. validate JavaScript/CSS syntax
6. test Home Assistant ingress
7. document user-visible behaviour
8. avoid introducing real private data into Demo Mode

## Demo Mode contributions

Demo Mode must remain synthetic-only by default.

A Demo Mode change must not:

- read real message bodies
- expose real contact names
- expose full destination hashes
- send LXMF messages
- trigger announces
- modify RNode or Reticulum configuration

Presentation scenes may use synthetic names, routes, messages and metrics.

## Pull requests

Keep pull requests focused. Describe what changed, why it changed, how it was
tested, known limitations, and whether persistent data or protocol behaviour is affected.

## Project relationship

N2K RNS Gateway is an independent third-party project. It is not an official
Home Assistant, Reticulum or LXMF product.
