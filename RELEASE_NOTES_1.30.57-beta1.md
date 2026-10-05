# N2K RNS Gateway DEV 1.30.57-beta1

## Systemhandbuch + erweiterter Demo Mode

### Systemhandbuch

Neu: `docs/SYSTEMHANDBUCH.md`

Das Handbuch dokumentiert jetzt vollständig:

- Systemarchitektur
- Reticulum / LXMF
- RNode / LoRa
- Transportwege
- Home-Assistant-Sensoren
- Home-Assistant-Events
- n2k.send_message
- n2k.send_announce
- n2k.refresh_status
- HA → LXMF Automationen
- sichere LXMF → Home-Assistant-Steuerung
- Whitelist- und Alias-Sicherheitsmodell
- Store & Forward
- Monitoring
- Diagnose
- Update / Rollback
- Demo Mode

Die lokale Offline-Hilfe in der App wurde ebenfalls um Home-Assistant-Automationen, sichere LXMF-Steuerung und Demo Mode erweitert.

### Demo Mode

Die Social Demo wächst von 15 auf 17 Kapitel.

Neu:

1. Home Assistant Automation
   - N2K Sensoren
   - Events
   - HA → LXMF Aktionen

2. Sichere LXMF → Home Assistant Steuerung
   - vertrauenswürdige Absender
   - feste Befehle
   - RUN-Alias
   - sanitisierter n2k_lxmf_command Event
   - keine freie Service-/Entity-/Code-Ausführung

### Laufzeit

Neue Mindestlaufzeit:

```text
≥ 03:47
```

17 Szenen / 227 Sekunden nominal.

Die bestehende Sprecher-Synchronisierung bleibt unverändert: eine Szene wartet auf das tatsächliche Ende der Sprachausgabe.

### Datenschutz

Die neuen Demo-Szenen bleiben vollständig synthetisch.

Sie lesen keine:

- echten Home-Assistant-Events
- echten Automationen
- Nachrichten
- Kontaktnamen
- Destination Hashes
- LXMF Commands

### Stream-Look

Der freigegebene helle Stream-Look bleibt unverändert.
