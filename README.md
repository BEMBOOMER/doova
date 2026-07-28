# Doova

Persoonlijke productiviteits-app voor macOS. Projecten als tabs, met blokken voor to-do's, notities en bestanden.

- **Checklist** — taken met subtaken, vervaldatum en kleurlabels
- **Notities** — rich text met koppen, lijsten en checkboxen
- **Dicteren** — klik het microfoontje in een notitie en je spraak wordt tekst, in het Nederlands of Engels. Draait volledig op je eigen Mac via de Speech-functie van macOS, dus er gaat geen audio het internet op.
- **Moodboards** — sleep afbeeldingen in een moodboard of plak ze met cmd+V. Ze worden gekopieerd naar Doova, dus je board blijft heel als je het origineel opruimt.
- **Exporteren** — rechtsklik op een blok voor een PDF of Word-bestand, met opmaak, checklists en beelden erin. Het omzetten doet macOS zelf.
- **Snel vastleggen** — een menubalk-icoontje en een systeembrede sneltoets openen een veldje over wat je ook aan het doen bent; wat je typt of inspreekt landt in je Inbox.
- **Plakken** — een link wordt een linkblok met titel en icoon, een beeld een moodboard, tekst een notitie.
- **Verbindingslijnen** — trek lijnen tussen blokken die meebewegen als je sleept.
- **Zoomen** — cmd+scroll, of klik het percentage linksonder om alles in beeld te halen.
- **Ongedaan maken** — cmd+Z over alles heen, met je eigen tekst-undo binnen een notitie.
- **Eigen datamap** — zet je data in iCloud Drive en je hebt synchronisatie zonder dat Doova daar iets voor hoeft te doen.
- **Bestanden** — sleep bestanden of mappen uit Finder erin; klik om ze direct weer in Finder te tonen
- **Thema's** — Glass (licht, doorschijnend, Apple-stijl) of bemboe (neo-brutalism), plus 8 accentkleuren
- Alles wordt lokaal opgeslagen, geen account of cloud

Gebouwd met [Tauri v2](https://tauri.app) + React + TypeScript.

## Download

De landingspagina staat op [doova.vercel.app](https://doova.vercel.app), uit de losse repo [doova-site](https://github.com/BEMBOOMER/doova-site).

Pak de nieuwste DMG van de [Releases-pagina](../../releases), open hem en sleep Doova naar Programma's.

### Eerste keer openen (belangrijk)

Doova is niet gesigneerd met een Apple Developer-certificaat. macOS blokkeert de app daarom bij de eerste start.

1. Rechtsklik (of Ctrl-klik) op **Doova** in je Programma's-map
2. Kies **Open**
3. Bevestig nogmaals met **Open**

Dit hoeft maar één keer. Blijft macOS weigeren, draai dan eenmalig in Terminal:

```bash
xattr -cr /Applications/Doova.app
```

## Ontwikkelen

Vereist: Node 20+, Rust (via [rustup](https://rustup.rs)), Xcode Command Line Tools.

```bash
npm install
npm run tauri dev
```

Release bouwen gebeurt automatisch: push een tag `v*` en GitHub Actions bouwt de DMG voor Apple Silicon als draft release. De draft is met opzet: de auto-updater kijkt naar `releases/latest`, dus zolang je hem niet publiceert krijgt niemand hem binnen.

Daarvoor moeten wel twee repo-secrets staan, anders zijn de updater-artefacten niet ondertekend en weigert elke geïnstalleerde Doova ze: `TAURI_SIGNING_PRIVATE_KEY` (de inhoud van `~/.tauri/doova.key`) en `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## Data

Je data staat lokaal in `~/Library/Application Support/com.bemboe.doova/` als leesbare JSON (`data.json`, `settings.json`), met automatische `.bak`-backup bij elke save.
