# Doova v0.2 — status & handoff

Voor wie hierna verder werkt (Codex/andere AI/mezelf later). Doova is een macOS-app
(Tauri v2 + React 18 + TypeScript + Zustand + Tailwind + Tiptap) in
`~/Desktop/Bemboe/Coding & Design/Coding/doova/` — **pad bevat spaties en `&`, altijd quoten in shell.**
Repo: github.com/BEMBOOMER/doova. v0.1 staat als release online (universal DMG, ongesigneerd).

## Wat v0.2 is (t.o.v. v0.1)

v0.1 was een horizontale rij vaste kolommen (tabs bovenin, checklist/note/file-blokken).
v0.2 is een complete herbouw van de layout-laag:

- **Vrij canvas**: blokken hebben `layout {x,y,width,height,z}`, je sleept ze aan de header,
  resize via 8 handles (react-moveable), magnetisch snappen (elementGuidelines + grid) met
  toggle en rastergrootte in settings. Nieuwe blokken vullen naar onderen via `findFreeSlot()`
  (AABB-scan). Dubbelklik op leeg canvas = blok op die plek. Persist alleen op drag-end.
- **Universeel blok**: "+" of dubbelklik maakt een leeg note-blok. Tekst typen → notitie
  (checklist = Tiptap TaskList erin, zoals Apple Notes). Bestand uit Finder droppen op een
  leeg note-blok → wordt file-organizer (`promoteBlockToFileOrganizer`); op gevuld
  note-blok/leeg canvas → nieuw file-blok op dropplek. Los checklist-bloktype bestaat niet meer.
- **Zijbalk** (Claude-stijl): projecten met klik=actief, dubbelklik=hernoem, sleep=herorden
  (dnd-kit vertical), ⋯-menu met hernoemen/samenvoegen/sluiten (met undo-toast). Inklapbaar
  (persistent). Onderin ⌘K en Instellingen. Traffic-lights zweven boven de zijbalk
  (`pt-[38px]` + drag-region). TabBar bestaat niet meer.
- **iOS26-glas**: surfaces 0.28/0.45 alpha, blur(32px) saturate(1.8), specular top-highlight
  via `.panel::before`, glasrand 0.65 wit. `reduce-transparency` class → opaak. Blur pauzeert
  tijdens drag (`body.is-interacting`). Schaduw-clipping opgelost: canvas-inner is
  contentgrootte + 400px marge, blokken `overflow: visible`, alleen `.block-body` scrollt.
- **Agenda-blok**: maandraster (native Date, ma-eerst), eigen events (+ tijd) via dag-klik,
  rode bolletjes voor ⏳-deadlines geaggregeerd uit TaskList-taken (`calendarAggregate.ts`).
- **Export**: `exportProjectMarkdown` (volledige dump, prosemirror-markdown met custom
  taskList/taskItem serializers) en `exportProjectDigest` (open taken + deadlines +
  notitie-kernen). Altijd naar klembord, plus save-dialog. Bereikbaar via ⌘K en Settings.
- **⌘K command-palette**: acties (nieuw blok/agenda/project, wisselen, export, settings) +
  globaal zoeken door alle blokken van alle projecten (titel, notitietekst, bestandsnamen,
  event-titels); hit selecteert het blok in het juiste project.
- **QoL**: blok dupliceren + blok-kleuren (⋯-menu op blok, kleurstreep bovenlangs),
  compact mode, auto-backup (bij start + elke 30 min → `backups/` in appdata, max 20,
  terugzetten via Settings), sneltoetsen-overzicht in Settings.
- **Migratie v1→v2** (`normalizeTabs` in projectsStore): checklist-blok → note met taskList
  (checked behouden, subtaken genest, dueDate → `· ⏳yyyy-mm-dd` en label → `· #tekst` als
  tekst-suffix; origineel bewaard in `_legacyChecklist`), blokken zonder layout krijgen hun
  oude rij-posities (x = 24 + i*316). Getest met een echte v1-file: klopt, schemaVersion 2
  wordt direct teruggeschreven.

## Bewuste afwijkingen van het plan

1. **Merge via ⋯-menu i.p.v. drag-op-projectmidden.** Drop-op-midden vs. drop-tussen
   onderscheiden in dnd-kit is jank-gevoelig; het menu is voorspelbaarder. Drag-merge kan
   later alsnog.
2. **`snapping.ts` bestaat niet** — react-moveable's ingebouwde `snappable` +
   `elementGuidelines` + `snapGridWidth/Height` dekt alles; eigen snap-wiskunde was overbodig.
3. **`defaultBlockType`-setting geschrapt** — met het universele blok is er niets te kiezen.
4. **AI-functie bewust niet gebouwd** (keuze van Roelof), ⌘K is puur lokaal.
5. **dueDate/label als tekst-suffix** i.p.v. custom TaskItem-attrs — geen custom schema nodig,
   agenda-aggregatie parset `⏳yyyy-mm-dd` uit de tekst. Lossy maar simpel; attrs kunnen later.

## Wat lastig was (leer hiervan)

- **React-moveable + React refs**: een inline ref-callback op het target veroorzaakte een
  oneindige render-lus (ref detach/attach → `registerTarget` → bump-state → re-render → …).
  Fix: ref stabiel maken met `useCallback`. Symptoom was een compleet lege app zonder
  console-error (alleen "Maximum update depth" op window.onerror).
- **`dragTarget` van Moveable deed niets** toen het element pas na mount via state binnenkwam.
  Opgelost door het hele blok als target te houden en in `onDragStart` te checken of de drag
  op `.block-drag-handle` begon (`e.stopDrag()` anders). Dit patroon is robuust.
- **Synthetische test-events bereiken Moveable niet betrouwbaar** (Gesto luistert op
  mouse-events; CDP-drags kwamen niet door). Met handmatige `mousedown/mousemove/mouseup`
  werkte alles. Drag/resize/snap is dus in code geverifieerd maar moet **op echte hardware
  met echte muis** nog een handtest krijgen.
- **Browser-pane vs. echte app**: fs/vibrancy bestaan niet in de browser; alle Tauri-calls
  zijn afgeschermd met `isTauri()` en de app degradeert netjes (opaque fallback-gradient).
  Fouten als "Backup of settings.json unreadable TypeError invoke" in de browser zijn
  verwacht en onschuldig.
- **Tiptap inputrule niet te testen via execCommand** ("[ ] tekst" plakken triggert de rule
  niet; hij vuurt op de spatie-toets). Handtest nodig: typ `[]` + spatie in een notitie.

## Nog te doen / handtests (voor Codex of Roelof)

1. **Echte-muis-test op de Mac**: blok slepen (alleen header), resize (eerst klikken =
   selecteren, dan handles), snapping aan/uit + rastergrootte, snap-guides zichtbaar
   (accent-kleur), z-order bij overlappen, dubbelklik-canvas.
2. **Finder-drag**: bestand op leeg blok (→ wordt Bestanden), op gevuld note-blok (→ nieuw
   blok op dropplek), op canvas-leegte. Reveal-in-Finder na drop. Hit-test gebruikt
   `elementsFromPoint` met `position.toLogical(devicePixelRatio)` — verifieer op extern
   scherm met andere scale-factor.
3. **TaskList-inputrules**: `[]`+spatie en `- `+spatie in een notitie.
4. **bemboe-thema op het canvas**: harde schaduwen op canvas-blokken, Moveable-handles
   leesbaar op paper-achtergrond, sidebar in bemboe. Nog niet visueel nagelopen.
5. **Vibrancy/glas op echte hardware**: doorschijnendheid vs. leesbaarheid, en de
   `reduce-transparency` toggle. Blur-pauze tijdens drag voelen (geen jank).
6. **Performance met 15+ blokken** (veel backdrop-filters). Zo nodig: één blur-laag achter
   het canvas i.p.v. per blok.
7. **Agenda**: event toevoegen/verwijderen, ⏳-deadline verschijnt als rood bolletje,
   maandnavigatie rond jaargrenzen.
8. **Export in de echte app**: save-dialog schrijft alleen binnen toegestane scopes
   (Documents/Desktop/Downloads zijn NIET gescoped in capabilities → schrijven daarbuiten
   faalt met nette toast, klembord werkt altijd). Overweeg scope-uitbreiding
   (`$DOCUMENT/**` etc.) in `src-tauri/capabilities/default.json` als save belangrijk wordt.
9. **Backups terugzetten**: knop herlaadt de app (window.location.reload) — check dat dat in
   Tauri netjes gaat.
10. **Release v0.2.0**: versie bumpen in `package.json` + `src-tauri/tauri.conf.json` +
    `Cargo.toml`, DMG bouwen (`npm run tauri build -- --target universal-apple-darwin`),
    `gh release create v0.2.0 <dmg>`. GitHub Actions-workflow staat nog in een lokale commit
    die niet gepusht kan worden totdat `gh auth refresh -h github.com -s workflow` is gedaan.

## Verbeterpunten / ideeën voor v0.3

- TaskItem custom attrs voor dueDate/label (niet-lossy) + datumpicker in de editor.
- Drag-merge van projecten + bevestigingsdialoog.
- Zoekresultaat in ⌘K: canvas laten scrollen naar het geselecteerde blok (nu alleen selectie).
- Multi-select blokken (rubber band) + groeps-verplaatsen.
- Blok "inklappen" tot alleen header.
- Canvas pannen met spatiebalk of two-finger, en zoom.
- `_legacyChecklist` opruimen in v3-migratie (staat er nu 1 versie voor rollback).
- Google Agenda (toggle staat al disabled in Settings als "Binnenkort").
- Eén blur-laag-optimalisatie als performance tegenvalt.

## Architectuur-spiekbriefje

- `src/types/index.ts` — alle types, SCHEMA_VERSION=2, DUE_MARKER="⏳", MIN/DEFAULT blokmaten.
- `src/stores/projectsStore.ts` — alle data-acties + migratie (`normalizeTabs`) +
  `findFreeSlot`. Persist via debounced `saveJsonDebounced` (atomic write + .bak) — zie
  `src/lib/persistence.ts` (flushAll bij close én Cmd+Q via Rust `exit-requested` event,
  zie `src-tauri/src/lib.rs`).
- `src/components/layout/CanvasBoard.tsx` + `blocks/CanvasBlock.tsx` — canvas + Moveable.
  `registerTarget` deelt element-refs voor snap-guidelines.
- `src/components/blocks/BlockContainer.tsx` — header (drag-handle, ⋯-menu: dupliceer/kleur,
  ✕ met undo) + body-router (note/file-organizer/calendar).
- `src/lib/exportMarkdown.ts` — prosemirror-markdown, LET OP: Tiptap-nodenamen zijn camelCase,
  de default serializer-nodes zijn gemapt (bulletList→bullet_list etc.).
- `src/lib/backup.ts` — auto-backup schema. `src/components/ui/CommandPalette.tsx` — ⌘K.
- Capabilities: `src-tauri/capabilities/default.json` (fs appdata + exists/stat overal,
  opener reveal overal, dialog, process:allow-exit, window destroy/set-effects).
