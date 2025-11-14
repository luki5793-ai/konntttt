# IT Contact Extractor - Apify Actor

Ein vollautomatischer Apify Actor zur Extraktion von Kontaktdaten von IT-Leitern und Hiring Managern aus verschiedenen Online-Quellen.

## Überblick

Dieser Actor extrahiert strukturierte Kontaktinformationen (Name, E-Mail, Telefon, Position) von Führungskräften und Personalverantwortlichen aus Unternehmen. Er nutzt eine Multi-Source-Strategie mit automatischen Fallback-Mechanismen für maximale Datenabdeckung.

### Hauptfunktionen

- **Multi-Source-Extraktion**: Unternehmenswebsites, LinkedIn, Xing, Unternehmensregister
- **Intelligente Validierung**: RFC 5322 E-Mail-Validierung, Telefonnummer-Normalisierung
- **Deduplizierung**: Automatische Erkennung und Entfernung von Duplikaten
- **Priorisierung**: Sortierung nach Relevanz der Position (CTO > CIO > HR Manager)
- **Retry-Logik**: Automatische Wiederholungsversuche bei Fehlern
- **Rate Limiting**: Respektvoller Umgang mit Server-Ressourcen

## Verwendungszweck

### Geeignet für:

- B2B Lead-Generierung im IT-Bereich
- Recruitment und Headhunting
- Marktforschung und Competitive Intelligence
- Geschäftsentwicklung und Sales

### WICHTIGE RECHTLICHE HINWEISE

⚠️ **Datenschutz (DSGVO)**:
- Personenbezogene Daten müssen DSGVO-konform verarbeitet werden
- Rechtmäßige Grundlage für Datenverarbeitung erforderlich
- Betroffenenrechte (Auskunft, Löschung) müssen gewährleistet werden

⚠️ **Terms of Service**:
- LinkedIn und Xing verbieten automatisiertes Scraping in ihren AGB
- Verwenden Sie offizielle APIs oder Partner-Lösungen
- Dieser Actor dient zu Demonstrations- und Bildungszwecken

⚠️ **Empfehlung**:
- Bevorzugen Sie Unternehmenswebsites und öffentliche Register
- Holen Sie ggf. rechtliche Beratung ein
- Implementieren Sie Opt-Out-Mechanismen

## Installation & Setup

### Voraussetzungen

- Apify Account ([kostenlos registrieren](https://console.apify.com/sign-up))
- Node.js 18+ (für lokale Entwicklung)

### Lokale Installation

```bash
# Repository klonen
git clone https://github.com/luki5793-ai/konntttt.git
cd konntttt

# Dependencies installieren
npm install

# Local Apify CLI installieren (optional)
npm install -g apify-cli

# Actor lokal ausführen
apify run
```

### Deployment auf Apify

1. Repository pushen oder über Apify Console hochladen
2. Actor erstellen und konfigurieren
3. Input-Parameter definieren (siehe unten)

## Input-Parameter

### Basis-Konfiguration

```json
{
  "companies": ["SAP", "Siemens", "Bosch"],
  "country": "Deutschland",
  "maxContactsPerCompany": 2,
  "targetRoles": [
    "CTO",
    "CIO",
    "Head of IT",
    "IT-Leiter",
    "VP Engineering",
    "Engineering Manager",
    "HR Director",
    "Recruiting Manager"
  ],
  "sources": ["company_website", "linkedin", "xing", "business_registry"],
  "maxRequestRetries": 3,
  "proxyConfiguration": {
    "useApifyProxy": true
  }
}
```

### Parameter-Beschreibung

| Parameter | Typ | Pflicht | Default | Beschreibung |
|-----------|-----|---------|---------|--------------|
| `companies` | Array | Ja | - | Liste der Unternehmensnamen |
| `country` | String | Nein | "Deutschland" | Land/Region für präzisere Suche |
| `maxContactsPerCompany` | Integer | Nein | 2 | Max. Kontakte pro Unternehmen (1-5) |
| `targetRoles` | Array | Nein | Siehe oben | Priorisierte Liste von Zielpositionen |
| `sources` | Array | Nein | Alle | Zu verwendende Datenquellen |
| `maxRequestRetries` | Integer | Nein | 3 | Max. Wiederholungsversuche bei Fehlern |
| `proxyConfiguration` | Object | Nein | `{useApifyProxy: true}` | Proxy-Konfiguration |

### Datenquellen

- `company_website`: Unternehmenswebsites (Team-, Über uns-, Kontakt-Seiten)
- `linkedin`: LinkedIn-Profile (⚠️ Verletzung der ToS)
- `xing`: Xing-Profile (⚠️ Verletzung der ToS)
- `business_registry`: Unternehmensregister und Impressum-Seiten

**Empfehlung**: Nur `company_website` und `business_registry` verwenden für rechtskonforme Nutzung.

## Output-Format

### Erfolgreiche Extraktion

```json
{
  "company": "SAP SE",
  "location": "Walldorf",
  "salutation": "Herr",
  "firstName": "Christian",
  "lastName": "Klein",
  "email": "christian.klein@sap.com",
  "phone": "+49 6227 7-47474",
  "jobTitle": "CEO",
  "linkedInUrl": "https://linkedin.com/in/christian-klein",
  "source": "company_website",
  "sourceUrl": "https://www.sap.com/about/company/leadership.html",
  "scrapedAt": "2025-11-14T10:30:00.000Z"
}
```

### Fehlgeschlagene Extraktion

```json
{
  "company": "Beispiel GmbH",
  "error": "No valid contacts found",
  "status": "failed",
  "timestamp": "2025-11-14T10:30:00.000Z"
}
```

### Zusammenfassung (letzter Eintrag)

```json
{
  "summary": {
    "companiesProcessed": 3,
    "totalCompanies": 3,
    "contactsSaved": 5,
    "averageContactsPerCompany": "1.67",
    "errors": 0
  },
  "timestamp": "2025-11-14T10:35:00.000Z"
}
```

## Beispiel-Runs

### Beispiel 1: Einzelnes Unternehmen

**Input:**
```json
{
  "companies": ["SAP"],
  "maxContactsPerCompany": 2,
  "sources": ["company_website"]
}
```

**Output:**
- 2 Kontakte (CTO, CIO oder ähnlich)
- Laufzeit: ~30-60 Sekunden
- Kosten: ~0.05 CU

### Beispiel 2: Mehrere Unternehmen

**Input:**
```json
{
  "companies": ["SAP", "Siemens", "Bosch", "BMW", "Telekom"],
  "maxContactsPerCompany": 2,
  "targetRoles": ["CTO", "CIO", "Head of IT"]
}
```

**Output:**
- Bis zu 10 Kontakte (2 pro Unternehmen)
- Laufzeit: ~3-5 Minuten
- Kosten: ~0.20-0.30 CU

### Beispiel 3: HR-Fokus

**Input:**
```json
{
  "companies": ["Google", "Microsoft", "Amazon"],
  "targetRoles": [
    "HR Director",
    "Recruiting Manager",
    "Head of Talent Acquisition"
  ],
  "sources": ["company_website", "business_registry"]
}
```

## Kostenabschätzung

### Compute Units (CU) Verbrauch

| Szenario | Unternehmen | Quellen | Geschätzte Laufzeit | CU-Verbrauch |
|----------|-------------|---------|---------------------|--------------|
| Klein | 1-5 | Website only | 1-3 Min. | 0.05-0.15 |
| Mittel | 10-20 | Website + Registry | 5-10 Min. | 0.30-0.60 |
| Groß | 50+ | Alle Quellen | 20-40 Min. | 1.50-3.00 |

**Faktoren die Kosten beeinflussen:**
- Anzahl der Unternehmen
- Anzahl der Datenquellen
- Verfügbarkeit von Kontaktdaten
- Proxy-Nutzung (Apify Proxy)
- Retry-Anzahl

**Tipp**: Starten Sie mit `company_website` only für niedrigere Kosten.

## Datenqualität & Validierung

### Validierungsregeln

**E-Mail:**
- RFC 5322 konform
- Keine generischen Adressen (info@, contact@, support@)
- Vollständige Domain-Validierung

**Telefon:**
- Internationales Format
- Mindestens 7 Ziffern
- Automatische Normalisierung (z.B. +49 30 123456)

**Namen:**
- Keine Platzhalter (test, dummy, example)
- Vorname und Nachname erforderlich
- Sonderzeichen-Filterung

**Position:**
- Muss Schlüsselwörter aus targetRoles enthalten
- Priorisierung nach Relevanz

### Deduplizierung

- Basierend auf E-Mail-Adresse (case-insensitive)
- Behält erste Instanz bei
- Sortierung vor Deduplizierung für beste Ergebnisse

## Technische Details

### Architektur

```
├── src/
│   ├── main.js           # Hauptlogik, Crawlee-Setup
│   ├── extractors.js     # Multi-Source Extraction
│   ├── validators.js     # Datenvalidierung
│   └── utils.js          # Hilfsfunktionen
├── .actor/
│   ├── actor.json        # Actor-Konfiguration
│   └── INPUT_SCHEMA.json # Input-Schema
├── package.json
├── Dockerfile
└── README.md
```

### Verwendete Technologien

- **Crawlee**: Web-Scraping-Framework
- **Playwright**: Headless Browser Automation
- **Apify SDK**: Actor-Entwicklung und Deployment

### Rate Limiting

- Standard: 1 Request pro 2 Sekunden
- Verhindert IP-Blocking
- Konfigurierbar in `utils.js`

### Error Handling

- Automatische Retries mit exponential backoff
- Fallback zu alternativen Quellen
- Detailliertes Error-Logging
- Fortsetzung bei einzelnen Fehlern

## Best Practices

### Optimale Nutzung

1. **Start klein**: Testen Sie mit 1-3 Unternehmen
2. **Quellen einschränken**: Nutzen Sie primär `company_website`
3. **Rollen spezifizieren**: Je genauer, desto besser die Ergebnisse
4. **Proxy nutzen**: Aktivieren Sie Apify Proxy für bessere Erfolgsrate

### Fehlerbehandlung

```javascript
// Prüfen Sie die Summary für Fehler
const dataset = await Actor.openDataset();
const data = await dataset.getData();
const summary = data.items[data.items.length - 1];

if (summary.summary.errors > 0) {
  console.log(`${summary.summary.errors} Fehler aufgetreten`);
}
```

### Performance-Tuning

- `maxConcurrency`: 1 (höher = schneller, aber riskanter)
- `navigationTimeoutSecs`: 30 (kann bei langsamen Sites erhöht werden)
- `maxRequestRetries`: 3 (Balance zwischen Erfolgsrate und Laufzeit)

## Limitierungen

### Technische Einschränkungen

- **E-Mail-Verfügbarkeit**: Nicht alle Websites publizieren E-Mail-Adressen
- **LinkedIn/Xing**: Benötigen meist Authentifizierung, öffentliche Profile zeigen selten E-Mails
- **Dynamische Websites**: JavaScript-heavy Sites können problematisch sein
- **CAPTCHAs**: Können Extraktion verhindern

### Rechtliche Einschränkungen

- **DSGVO**: Strenge Anforderungen an Datenverarbeitung
- **ToS-Verletzungen**: LinkedIn/Xing-Scraping ist nicht erlaubt
- **UWG**: Unlauterer Wettbewerb bei missbräuchlicher Nutzung

### Qualitätseinschränkungen

- Datenqualität hängt von Quellen ab
- Nicht alle Unternehmen haben öffentliche Kontaktdaten
- Veraltete Informationen möglich

## Troubleshooting

### Problem: Keine Kontakte gefunden

**Lösung:**
- Prüfen Sie, ob Website Team-/Kontakt-Seiten hat
- Erweitern Sie `targetRoles` auf breitere Begriffe
- Aktivieren Sie zusätzliche Quellen

### Problem: Ungültige E-Mails

**Lösung:**
- Validierung ist streng - generische E-Mails werden gefiltert
- Prüfen Sie Quellseiten manuell
- Möglicherweise nur Kontaktformulare statt E-Mails

### Problem: Hoher CU-Verbrauch

**Lösung:**
- Reduzieren Sie `maxRequestRetries`
- Nutzen Sie nur `company_website` als Quelle
- Reduzieren Sie `navigationTimeoutSecs`

### Problem: Timeouts

**Lösung:**
- Erhöhen Sie `requestHandlerTimeoutSecs`
- Reduzieren Sie Anzahl gleichzeitiger Unternehmen
- Verwenden Sie schnellere Proxy-Server

## Support & Weiterentwicklung

### Bekannte Issues

- LinkedIn/Xing-Extraktion erfordert Login
- Manche Unternehmenswebsites nutzen aggressive Bot-Protection
- Internationale Telefonnummern-Formate teilweise inkonsistent

### Geplante Features

- [ ] API-Integration für LinkedIn/Xing
- [ ] Export zu CRM-Systemen (Salesforce, HubSpot)
- [ ] Email-Verifikation via SMTP
- [ ] Erweiterte DSGVO-Compliance-Tools
- [ ] Machine Learning für bessere Personenerkennung

### Beitragen

Contributions sind willkommen! Bitte erstellen Sie Issues oder Pull Requests im GitHub Repository.

## Lizenz

Apache 2.0 - siehe LICENSE Datei

## Disclaimer

Dieser Actor wird "as-is" bereitgestellt. Die Nutzung erfolgt auf eigene Verantwortung. Die Entwickler übernehmen keine Haftung für:

- Rechtliche Konsequenzen der Nutzung
- Datenqualität oder -richtigkeit
- Verstöße gegen Datenschutzbestimmungen
- Verletzung von Terms of Service Dritter

**Verwenden Sie diesen Actor verantwortungsvoll und im Einklang mit geltendem Recht.**

## Kontakt

Bei Fragen oder Support-Anfragen öffnen Sie bitte ein Issue im GitHub Repository.

---

**Version**: 1.0.0
**Letzte Aktualisierung**: 2025-11-14
