import type { JSONContent } from "@tiptap/react";
import type { Block, CalendarEvent, NoteBlockData, ProjectTab } from "../types";
import { newId, nowIso } from "./ids";

/**
 * The project a brand new install opens on.
 *
 * It exists because an empty canvas teaches nothing: every gesture in Doova
 * (double-click, drag, right-click, dictate) is discoverable only once you know
 * it is there. So the first thing you see is a board that says so, made of the
 * same blocks you would make yourself, ready to be edited over or thrown away.
 *
 * Only ever seeded when data.json is genuinely absent. A failed read must never
 * reach this, or a recoverable file would be replaced by sample text.
 */

interface TextLine {
  text: string;
  bold?: boolean;
}

function paragraph(lines: TextLine[]): JSONContent {
  return {
    type: "paragraph",
    content: lines.map(({ text, bold }) => ({
      type: "text",
      text,
      ...(bold ? { marks: [{ type: "bold" }] } : {}),
    })),
  };
}

function heading(text: string): JSONContent {
  return {
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text }],
  };
}

function task(text: string, checked = false): JSONContent {
  return {
    type: "taskItem",
    attrs: { checked },
    content: [paragraph([{ text }])],
  };
}

function doc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function note(
  title: string,
  content: JSONContent,
  layout: NoteBlockData["layout"],
): NoteBlockData {
  return { id: newId(), type: "note", title, createdAt: nowIso(), content, layout };
}

/** A couple of days out, so the sample agenda looks alive rather than expired. */
function soon(daysAhead: number): string {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

export function makeWelcomeTab(): ProjectTab {
  const events: CalendarEvent[] = [
    { id: newId(), title: "Iets met een datum", date: soon(3), time: "10:00", note: null, color: null },
    { id: newId(), title: "Dubbelklik een dag voor een eigen afspraak", date: soon(9), time: null, note: null, color: null },
  ];

  const blocks: Block[] = [
    note(
      "Welkom",
      doc([
        heading("Dit is je canvas"),
        paragraph([
          { text: "Alles ligt waar jij het neerlegt. " },
          { text: "Dubbelklik", bold: true },
          { text: " op een lege plek voor een nieuw blok, sleep een blok aan zijn naam, en pak een rand om het groter te maken." },
        ]),
        paragraph([
          { text: "Rechtsklik", bold: true },
          { text: " op het canvas voor een agenda of een moodboard, en op een blok voor hernoemen, kleuren, koppelen of exporteren naar PDF of Word." },
        ]),
        paragraph([
          { text: "Dit blok mag je gewoon overschrijven of weggooien." },
        ]),
      ]),
      { x: 40, y: 40, width: 380, height: 300, z: 1 },
    ),

    note(
      "Handig om te weten",
      doc([
        paragraph([
          { text: "⌘K", bold: true },
          { text: " zoekt door al je projecten en blokken tegelijk." },
        ]),
        paragraph([
          { text: "Het microfoontje", bold: true },
          { text: " in de knoppenbalk hierboven zet je spraak om in tekst, in het Nederlands of Engels. Dat gebeurt op je eigen Mac." },
        ]),
        paragraph([
          { text: "Sleep een bestand", bold: true },
          { text: " uit Finder op een blok en het komt erin te staan. Klik het later aan om het in Finder terug te vinden." },
        ]),
        paragraph([
          { text: "Alles staat lokaal op je Mac als leesbare JSON. Geen account, geen cloud, en Doova maakt automatisch back-ups." },
        ]),
      ]),
      { x: 440, y: 40, width: 360, height: 300, z: 2 },
    ),

    note(
      "Even proberen",
      doc([
        {
          type: "taskList",
          content: [
            task("Vink mij af", true),
            task("Typ hier iets van jezelf"),
            task("Sleep dit blok een stuk naar rechts"),
            task("Maak met ⌘K een nieuw project"),
          ],
        },
      ]),
      { x: 40, y: 360, width: 380, height: 240, z: 3 },
    ),

    {
      id: newId(),
      type: "calendar",
      title: "Agenda",
      createdAt: nowIso(),
      layout: { x: 440, y: 360, width: 360, height: 300, z: 4 },
      events,
    },
  ];

  return { id: newId(), name: "Welkom bij Doova", blocks, createdAt: nowIso() };
}
