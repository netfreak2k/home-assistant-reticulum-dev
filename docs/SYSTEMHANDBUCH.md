# N2K RNS Gateway — Systemhandbuch

Stand: **1.30.59-beta1**

Dieses Handbuch beschreibt Aufbau, Betrieb und Home-Assistant-Anbindung des N2K RNS Gateway. Es richtet sich an Anwender, Administratoren und Tester, die Reticulum/LXMF in Home Assistant betreiben und automatisieren möchten.

## 1. Systemüberblick

N2K RNS Gateway verbindet Home Assistant mit:

- Reticulum Network Stack (RNS)
- LXMF Messaging
- optionalem RNode / LoRa
- AutoInterface / LAN
- TCP- und Internet-Backbones
- LXMF Store & Forward über Propagation Nodes
- Home-Assistant-Sensoren, Events und Aktionen

Der Gateway-Prozess bleibt lokal. Home Assistant dient als Bedien-, Automations- und Monitoring-Ebene.

## 2. Architektur

```text
Home Assistant
   │
   ├── N2K Sensoren / Binary Sensoren
   ├── N2K Events
   ├── n2k.send_message
   ├── n2k.send_announce
   └── n2k.refresh_status
           │
           ▼
N2K RNS Gateway
   │
   ├── LXMF Messenger
   ├── Reticulum Node
   ├── Living Mesh / Monitoring
   └── RNode / LAN / TCP / Internet
           │
           ▼
Reticulum / LXMF Netzwerk
```

Die Kommunikation zwischen Add-on und Home Assistant nutzt die Home-Assistant-Core-API sowie lokale Dateien unter `/config/reticulum_bridge`.

## 3. Installation

1. Home Assistant öffnen.
2. **Einstellungen → Add-ons → Add-on Store → ⋮ → Repositories**.
3. Repository hinzufügen:

   `https://github.com/netfreak2k/home-assistant-reticulum-dev`

4. **N2K RNS Gateway DEV** installieren.
5. Add-on starten.
6. Web UI öffnen.
7. **Messenger → Einstellungen → Systemcheck → Prüfen** ausführen.

## 4. Persistente Identität

Die Reticulum- und LXMF-Identität wird persistent gespeichert.

Nicht löschen, wenn die bestehende Adresse erhalten bleiben soll.

Nach Updates und Neustarts prüfen:

- Reticulum online
- Destination Hash unverändert
- Kontakte vorhanden
- LXMF send/receive funktioniert
- RNode bzw. Interfaces wieder online

## 5. Unterstützte Transportwege

### AutoInterface

Lokale Reticulum-Verbindungen über das LAN.

### TCP / Backbone

Verbindungen zu Reticulum-TCP-Peers oder Backbones.

### Internet Bootstrap

Optionale öffentliche Internet-Backbones zur Erreichbarkeit außerhalb des lokalen Netzes.

### RNode / LoRa

Ein RNode stellt den Funkweg bereit. Typische Zustände und Funkwerte werden in der App und in Home Assistant veröffentlicht.

## 6. LXMF Messenger

Unterstützt werden:

- Nachrichten senden/empfangen
- Delivery Status
- Retry
- Kontakte und lokale Aliase
- QR-Codes
- Announce
- Pfad-/Hop-Informationen
- Store & Forward
- Propagation Nodes

## 7. Home-Assistant-Entitäten

Die Zustände werden regelmäßig direkt an Home Assistant publiziert.

### Binary Sensoren

- `binary_sensor.n2k_reticulum_online`
- `binary_sensor.n2k_rnode_online`
- `binary_sensor.n2k_lxmf_ready`

### Sensoren

- `sensor.n2k_reticulum_interfaces`
- `sensor.n2k_internet_peers`
- `sensor.n2k_rnode_noise_floor`
- `sensor.n2k_rnode_airtime_15s`
- `sensor.n2k_lxmf_conversations`
- `sensor.n2k_lxmf_unread`
- `sensor.n2k_lxmf_inbox`
- `sensor.n2k_lxmf_outbox`
- `sensor.n2k_store_forward_status`

Kompatibilität:

- `sensor.reticulum_status`

## 8. Home-Assistant-Events

### `n2k_status_changed`

Wird ausgelöst, wenn sich Reticulum-, RNode- oder LXMF-Bereitschaft ändert.

### `n2k_lxmf_message_received`

Wird ausgelöst, wenn der LXMF-Inbox-Zähler steigt.

Der Event enthält keine Nachrichtentexte und keine Kontaktidentitäten.

### `n2k_control_result`

Ergebnis von Announce- oder Refresh-Anforderungen.

### `n2k_lxmf_command`

Sanitisierter Event für die sichere LXMF→Home-Assistant-Steuerung.

Enthalten sind nur:

- `command`
- `alias`
- gekürzte `source_id`
- Zeitstempel

Nicht enthalten:

- voller Source Hash
- Nachrichtentext
- freie Service-Namen
- Entity-IDs
- YAML oder Code

## 9. Home-Assistant-Aktionen

### LXMF-Nachricht senden

```yaml
action:
  - service: n2k.send_message
    data:
      destination_hash: "0123456789abcdef0123456789abcdef"
      title: "Home Assistant"
      content: "WARNUNG: Netzstrom ausgefallen"
```

### LXMF Announce senden

```yaml
action:
  - service: n2k.send_announce
```

### Status sofort aktualisieren

```yaml
action:
  - service: n2k.refresh_status
```

Kompatibilitätsnamen:

- `reticulum.send_message`
- `reticulum.send_announce`
- `reticulum.refresh_status`

## 10. Beispiel: Home Assistant → LXMF

Bei einem beliebigen HA-Ereignis kann eine Nachricht über Reticulum gesendet werden.

```yaml
trigger:
  - platform: state
    entity_id: binary_sensor.netzstrom
    to: "off"

action:
  - service: n2k.send_message
    data:
      destination_hash: "0123456789abcdef0123456789abcdef"
      title: "N2K Alarm"
      content: "Netzstrom ist ausgefallen."
```

## 11. Sichere LXMF → Home-Assistant-Steuerung

Diese Funktion ist standardmäßig deaktiviert.

### Aktivieren

Add-on-Konfiguration:

```yaml
ha_commands_enabled: true
ha_trusted_sources: "0123456789abcdef0123456789abcdef"
```

Mehrere vertrauenswürdige Source Hashes werden kommasepariert eingetragen.

### Erlaubte Befehle

```text
!HA PING
!HA STATUS
!HA HELP
!HA RUN LIGHT_ON
```

### Sicherheitsmodell

Ein eingehender LXMF-Text darf niemals direkt:

- einen Home-Assistant-Service bestimmen
- eine Entity-ID bestimmen
- YAML übergeben
- Python/Shell-Code ausführen
- beliebige Parameter einschleusen

`RUN` akzeptiert ausschließlich einen Alias aus:

`A-Z 0-9 _ -`

maximal 32 Zeichen.

Der Alias wird als `n2k_lxmf_command` Event an Home Assistant übergeben. Erst eine lokal definierte HA-Automation entscheidet, was dieser Alias ausführt.

### Beispielautomation

```yaml
trigger:
  - platform: event
    event_type: n2k_lxmf_command
    event_data:
      command: RUN
      alias: LIGHT_ON

action:
  - service: light.turn_on
    target:
      entity_id: light.wohnzimmer
```

Damit bleibt Home Assistant die Policy- und Ausführungsebene.

## 12. Datenschutz

N2K trennt Demo-, Diagnose- und Automationsdaten bewusst.

### Nicht in HA-Command-Events

- Nachrichtentext
- voller LXMF Source Hash
- Kontaktname
- beliebige freie Nutzdaten

### Nicht in der Social Demo

- echte Kontakte
- echte Nachrichten
- echte Destination Hashes
- echte Automationsereignisse

## 13. Store & Forward

Wenn direkte Zustellung nicht möglich ist, kann LXMF Propagation Nodes verwenden.

Zu prüfen:

- Propagation aktiviert
- Node erkannt bzw. ausgewählt
- letzter Sync erfolgreich
- `sensor.n2k_store_forward_status`
- Delivery Status im Messenger

## 14. Monitoring

Geeignete Home-Assistant-Historienwerte:

- RNode Noise Floor
- RNode Airtime
- Internet Peer Count
- Reticulum Interface Count
- Inbox / Outbox
- Online-Zustände

Damit lassen sich Verfügbarkeit und Funkentwicklung über längere Zeiträume auswerten.

## 15. Diagnose

Bei Problemen:

1. Systemcheck ausführen.
2. Add-on-Log prüfen.
3. Diagnose exportieren.
4. Home Assistant unter **Entwicklerwerkzeuge → Zustände** prüfen.
5. Unter **Entwicklerwerkzeuge → Aktionen** nach `n2k.*` suchen.
6. Für Events **Entwicklerwerkzeuge → Ereignisse** verwenden.

## 16. Update- und Rollback-Regel

Vor Beta-Updates:

- Home-Assistant-Backup erstellen
- bekannte funktionierende Version notieren
- Identitätsdaten nicht löschen
- nach Update Systemcheck und LXMF-Test durchführen

Der freigegebene Demo-/Stream-Snapshot von 1.30.53-beta1 bleibt als Rückkehrpunkt unter:

`frozen/1.30.53-beta1`

## 17. Demo Mode

Die Social Demo ist synthetisch und vom Live-Messenger getrennt.

Aktuell zeigt sie 17 Kapitel, darunter:

- Reticulum und LXMF
- Living Mesh
- RNode / LoRa
- Store & Forward
- Monitoring
- Home-Assistant-Sensoren und Events
- HA → LXMF Aktionen
- sichere LXMF → HA Commands
- Entwicklung und Projektziele

Die Mindestlaufzeit beträgt etwa **3:47**. Bei aktivem Sprecher wartet jede Szene auf das tatsächliche Ende der Sprachausgabe.

### N2K Mesh Plaza

Seit 1.30.58-beta1 läuft der Demo Mode als dauerhafte Stream-Schleife mit eigenem Mesh-Plaza-Hintergrund.

Gemeinsame Elemente:

- animierte Reticulum-Pfade
- laufende Signalpakete
- pulsierende Nodes
- RNS-, LXMF- und Home-Assistant-Broadcastfenster
- kontinuierlicher Mesh-Plaza-Lauftext

Die Bewegungscharakteristik wird pro Szene verändert. Dadurch bleibt ein Twitch-/YouTube-Dauerstream auch bei wiederholten Loops visuell aktiv.

Die Gestaltung ist eine eigenständige Hommage an die Idee eines offenen digitalen Treffpunkts und partizipativen Netzfernsehens. Sie verwendet ausschließlich eigene N2K-Grafiken und Animationen.

### TV Safe

Der Schalter **TV SAFE** ist für Studio-, Fernseh- und Dauerstream-Betrieb gedacht.

Er bewirkt:

- automatische 16:9-Darstellung
- Vollbildversuch
- automatische Wiedergabe
- Ausblenden von Navigation und Bedienelementen
- Beibehaltung von Watermark und optionalen Untertiteln
- nahtloseren Übergang vom Finale zurück zum Intro
- dynamischen Broadcast-Ticker
- synthetische Plaza-Presence

TV Safe ändert keine Live-Daten- oder Datenschutzregeln. Alle Presence-Punkte und Ticker-Meldungen bleiben synthetisch.

## 18. Grenzen

Die Software befindet sich weiterhin im Beta-Stadium.

Insbesondere sollten sicherheitsrelevante Automationen hinter LXMF-Kommandos immer bewusst lokal definiert und getestet werden.

N2K RNS Gateway ist kein offizielles Produkt von Home Assistant, Reticulum oder LXMF.

## 19. Projekt

**N2K RNS Gateway**  
Netfreak2k

Repository:

`https://github.com/netfreak2k/home-assistant-reticulum-dev`
