# Das Projekt Energiemonitor
Dieses Projekt soll es dir ermöglichen, deinen Energieverbrauch zu messen, in Echtzeit zu analysieren, zu verstehen und zu optimieren - mit dem Ziel dass du mit den einfachen aber richtigen Aktionen im Alltag 20% deines Energieverbrauchs einsparen kannst. Dieses Projekt wird vom [Verein Kleinwohnformen](https://kleinwohnformen.ch) getragen und ist in erster Linie auf kleine, unabhängige Wohnformen zugeschnitten. Es ist aber nicht ausgeschlossen, dass du unseren Monitor auch für deine Wohnung bauen und nutzen kannst - wir sind Open Source und Mitmachen im Projekt ist erwünscht! Einfach melden beim [Energiemonitor-Team](mailto:energiemonitor@kleinwohnformen.ch).

## Projekt-Repos
- [Referenz-HW und Provisionierung mit BalenaOS](https://github.com/Verein-Kleinwohnformen/energiemonitor-balena-nodered)
- [NodeRED-Connector neu](https://github.com/Verein-Kleinwohnformen/kwf-energiemonitor-db)
- [NodeRED Beispiel-Flows (depr.)](https://github.com/Verein-Kleinwohnformen/energiemonitor-nodered-flows)
- [Energiemonitor-App (Repo)](https://github.com/Verein-Kleinwohnformen/energiemonitor-app)
- [Energiemonitor-App (Demo)](https://energiemonitor-kwf.web.app/)

## Angestrebte Architektur
Wir befinden uns noch in der Designphase, viele der eingezeichneten Komponenten existieren noch nicht. Wir streben aber das folgende System an:

![Hardware-Architektur](img/arch1.png)

![Software-Architektur](img/arch2.png)


# NodeRED Connector für KWF Energiemonitor (beta)
Dieser Node ist der Kernbaustein des KWF Energiemonitors. Du musst dich nur noch darum kümmern, die gewünschten Datenkanäle einzulesen, und sie in einem passenden Intervall mit dem richtigen Topic an diesen Baustein (KWF Datenbank-Connector) zu schicken, und dieser Block übernimmt den Rest, nämlich:
- Daten in einer lokalen Datenbank zwischenspeichern
- Daten regelmässig (1 mal pro Stunde) oder wenn wieder eine Internetverbindung vorhanden ist, an die Datenbank zu schicken.

So sieht eine Beispiel-Konfiguration aus. Deine NodeRED-Bausteine sollten noch folgende Aufgaben übernehmen:
- Daten ggf. aggregieren und in der empfohlenen Frequenz an diesen Connector schicken (Idee: Zukünftig könnte auch dieser Konnektor Daten aggregieren, um Fehler und falsche Inputs in der Datenbank zu vermeiden)
- Das richtige Format sicherstellen
- Das richtige Topic anfügen

Das sieht dann so aus. Auf der linken Seite hast du deine Mess-Blocks, die alle mit unserem Connector verbunden sind.
![Beispiel](img/nodered-example.jpg)

### Installation
Dieser Node ist bereits in der [NodeRED-Library](https://flows.nodered.org/node/@vereinkleinwohnformen/node-red-energiemonitor) verfügbar.

### Konfiguration
Diese Parameter müssen konfiguriert werden:
- Einen Pfad, auf dem Daten persistent gespeichert werden können (für die Datenbank zur Zwischenspeicherung). Für eine Einrichtung auf Balena den Default-Wert beibehalten. Im Fall von Datenbank-Fehlern (z.B. alte Version des Blocks hat bereits ein anderes Datenbank-Format) kann es helfen, den Namen des Datenbank-Files auszutauschen.
- Sende-Intervall (ms), in dem die Daten an die Datenbank gesendet werden. Zum Testen ca. 1 Minute nehmen und im Betrieb 1 Stunde (Default).
- Die URL der API, am besten aus den Balena Flotten-Variablen übernehmen
- Deinen Device API-Key, am besten aus den Balena Device-Variablen übernehmen

### Input-Datenformat

Das Input-Datenformat basiert jetzt auf Messpunkten (measurement_point), die für jede Wohneinheit separat definiert werden. Jeder Sensor hat eine eindeutige ID und jeder Datenpunkt wird einem spezifischen Messpunkt zugeordnet.

**Wichtig:** Topics werden nicht mehr verwendet. Alle Informationen werden in `msg.payload` übertragen.

#### Grundlegendes Format

```json
{
  "values": {
    // Sensor-spezifische Messwerte
  },
  "sensor_id": "eindeutige-sensor-id",
  "timestamp": 1760084970005,
  "metering_point": "XX"
}
```

#### Unterstützte Messpunkte

Basierend auf dem Messkonzept werden folgende Messpunkte unterstützt:

**Externe Messpunkte (Rand der Systemdefinition):**

- `E1`: Netzbezug el. Energie [kWh]
- `E2`: Rückspeisung el. Energie [kWh]  
- `E3`: Eigenproduktion el. Energie [kWh]
- `M1`: Gas in Flaschen [kg]
- `M2`: Brennholz oder Pellets [kg, Ster]
- `A1`: Abzug Verbrauch Energiemonitor [kWh]

**Interne Messpunkte:**

- `I1`: Warmwassererzeugung [kWh / kg Gas]
- `I2`: Energiebedarf Heizung [kWh / kg / Ster]

**Wohnkomfort:**

- `K0`: Wohnkomfort Allgemein (Kombinierte Sensoren) [°C, % RH, ppm]
- `K1`: Innentemperatur, Lieblingsort [°C]
- `K2`: Aussentemperatur N, Schatten [°C]
- `K3`: Luftfeuchtigkeit, Lieblingsort [% RH]
- `K4`: CO2-Gehalt, Lieblingsort [ppm]

**Wasser:**

- `D1`: Gesamtwasserverbrauch [m3]

#### Beispiele für verschiedene Sensortypen

**230V Stromklemmen (z.B. Shelly 3EM Pro):**

```json
{
  "values": {
    "voltage": 231.27,
    "act_power": 14.555,
    "pf": 0.33,
    "aprt_power": 44.35
  },
  "sensor_id": "shelly-3em-pro",
  "timestamp": 1760084970005,
  "metering_point": "E1"
}
```

**Netatmo Wetterstation:**

```json
{
  "values": {
    "device_id": "aa:bb:cc:dd:ee:01",
    "device_reachable": true,
    "wifi_signal_strength": 65,
    "temperature_indoor": 19.8,
    "humidity_indoor": 51,
    "co2_indoor": 460,
    "pressure": 1028.9,
    "noise_level": 32,
    "pressure_absolute": 976.5,
    "outdoor_module_reachable": true,
    "outdoor_module_id": "aa:bb:cc:dd:ee:02",
    "temperature_outdoor": 18.4,
    "humidity_outdoor": 60,
    "battery_level": 100,
    "rf_signal_strength": 53,
    "battery_voltage": 6116,
    "temperature_difference": 1.4
  },
  "sensor_id": "netatmo",
  "timestamp": 1760086636000,
  "metering_point": "K0"
}
```

#### Per-Value Timestamps mit `ts_` Prefix (v0.4.2+)

Der Node unterstützt **individuelle Timestamps für jeden Messwert** über das `ts_` Präfix-System. Dies ist besonders nützlich für Sensoren, die ihre Messwerte in unterschiedlichen Intervallen aktualisieren.

**Wie es funktioniert:**

- Für jeden Messwert kann ein individueller Timestamp mit dem Präfix `ts_` angegeben werden
- Der Node gruppiert automatisch Werte mit gleichen Timestamps in separate Datenbankeinträge
- Werte ohne `ts_` Präfix werden in alle Datenbankeinträge übernommen (z.B. Metadaten)
- Vollständig rückwärtskompatibel: Funktioniert auch ohne `ts_` Präfixe

**Beispiel: Netatmo mit individuellen Timestamps**

```json
{
  "values": {
    "ts_temperature_indoor": 1761140223000,
    "temperature_indoor": 19.6,
    "ts_humidity_indoor": 1761140223000,
    "humidity_indoor": 51,
    "ts_temperature_outdoor": 1761140210000,
    "temperature_outdoor": 18.8,
    "ts_humidity_outdoor": 1761140210000,
    "humidity_outdoor": 64,
    "wifi_signal_strength": 67,
    "device_id": "aa:bb:cc:dd:ee:01"
  },
  "sensor_id": "netatmo",
  "timestamp": 1761140877000,
  "metering_point": "K0"
}
```

**Resultierende Datenbankeinträge:**

```
Eintrag 1: timestamp=1761140223000
  - temperature_indoor: 19.6
  - humidity_indoor: 51
  - wifi_signal_strength: 67
  - device_id: "aa:bb:cc:dd:ee:01"

Eintrag 2: timestamp=1761140210000
  - temperature_outdoor: 18.8
  - humidity_outdoor: 64
  - wifi_signal_strength: 67
  - device_id: "aa:bb:cc:dd:ee:01"
```

**Vorteile:**

- ✅ Präzise Zeitstempel für jede Messung
- ✅ Automatische Gruppierung nach Timestamp
- ✅ Metadaten werden in alle Einträge übernommen
- ✅ Verhindert Duplikate durch intelligente Merge-Logik
- ✅ Universal einsetzbar für beliebige Sensoren

## Unterstützte Sensortypen

Die folgende Tabelle zeigt die aktuell unterstützten Sensortypen und ihre typischen Anwendungsfälle:

| Sensortyp | Sensor ID | Beschreibung | Typische Messpunkte | Gemessene Werte |
|-----------|-----------|--------------|-------------------|-----------------|
| **Shelly 3EM Pro** | `shelly-3em-pro` | 230V Stromklemmen für Energiemessung | E1, E2, E3, A1, I1, I2 | voltage, act_power, pf, aprt_power |
| **Netatmo Wetterstation** | `netatmo` | Innen- und Außenklima-Monitoring | K0, K1, K2, K3, K4 | Temperatur, Luftfeuchtigkeit, CO2, Luftdruck, Lärm, Batteriestand, Signalstärke |

## Todo

Weitere Aufgaben für dieses Projekt:

- Support für Victron Cerbo GX testen
- Basis-Sensoren des Energiemonitor-Kits einbinden
- Weitere Datenformate unterstützen: Alle Victron-Geräte, sowie weitere Input-Daten
- Aggregation der Messdaten übernehmen, damit nicht zuviele Daten in die Cloud geschickt werden können, sondern vorher ein Durchschnitt gebildet wird
