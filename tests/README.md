# Isolated regression checks

Run from the repository root with Python 3.12 or newer:

```sh
python3 tests/check_storage.py
python3 tests/check_http.py
python3 tests/check_startup.py
```

The checks use temporary directories. They do not access the live Home Assistant, RNode, Supervisor, or Reticulum network.

- Storage: real server functions and extracted node storage callbacks, simultaneous writes, delivery updates, duplicate delivery.
- HTTP: actual local HTTP handler, saved contacts, malformed hashes, static routes, competing web/HA writers to the same queue slot.
- Startup: simulated bashio/rnsd, config creation, repeated startup, managed block uniqueness, preservation of a manual interface. `/dev/null` represents an available character device; no serial commands are sent.

The storage and HTTP scripts temporarily stub only the QR imports so they can import the web module without installing add-on dependencies. They do not test QR generation or full HA/RNS/LXMF startup. Node/HA functions are extracted with AST because importing these modules would start live services or require Home Assistant.
