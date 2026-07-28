import type { JSONContent } from "@tiptap/react";
import type { BlockLayout, NewBlock } from "../types";

/**
 * Starting points for the boards you build over and over.
 *
 * Pure data: a template is a list of blocks with positions relative to where you
 * drop it, given fresh ids by the store. Nothing here knows about state, so a
 * new template is a literal rather than code.
 */

export interface Template {
  id: string;
  name: string;
  hint: string;
  build: () => NewBlock[];
}

function layout(x: number, y: number, width: number, height: number, z: number): BlockLayout {
  return { x, y, width, height, z };
}

function para(text: string): JSONContent {
  return { type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) };
}

function head(text: string): JSONContent {
  return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] };
}

function tasks(items: string[]): JSONContent {
  return {
    type: "taskList",
    content: items.map((text) => ({
      type: "taskItem",
      attrs: { checked: false },
      content: [para(text)],
    })),
  };
}

function doc(content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

function note(title: string, content: JSONContent, at: BlockLayout): NewBlock {
  return { type: "note", title, content, layout: at };
}

export const TEMPLATES: Template[] = [
  {
    id: "briefing",
    name: "Briefing",
    hint: "Opdracht, planning en losse aantekeningen",
    build: () => [
      note(
        "Briefing",
        doc([
          head("Wat gaan we maken"),
          para(""),
          head("Voor wie"),
          para(""),
          head("Wat moet het doen"),
          para(""),
        ]),
        layout(0, 0, 380, 360, 1),
      ),
      note(
        "Afspraken",
        doc([
          tasks(["Deadline vastleggen", "Budget bevestigen", "Aanleveren van materiaal"]),
        ]),
        layout(400, 0, 320, 250, 2),
      ),
      note("Aantekeningen", doc([para("")]), layout(400, 270, 320, 240, 3)),
    ],
  },
  {
    id: "moodboard-shotlist",
    name: "Moodboard en shotlist",
    hint: "Beeldrichting naast wat er gedraaid moet worden",
    build: () => [
      { type: "moodboard", title: "Moodboard", images: [], layout: layout(0, 0, 420, 460, 1) },
      note(
        "Shotlist",
        doc([tasks(["Establishing shot", "Detail", "Portret", "Insert"])]),
        layout(440, 0, 320, 300, 2),
      ),
      {
        type: "swatch",
        title: "Kleuren",
        swatches: [],
        layout: layout(440, 320, 320, 140, 3),
      },
    ],
  },
  {
    id: "weekplanning",
    name: "Weekplanning",
    hint: "Vijf dagen naast je agenda",
    build: () => {
      const days = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag"];
      const blocks: NewBlock[] = days.map((day, i) =>
        note(day, doc([tasks([""])]), layout(i * 240, 0, 220, 300, i + 1)),
      );
      blocks.push({
        type: "calendar",
        title: "Deze maand",
        events: [],
        layout: layout(0, 320, 360, 300, days.length + 1),
      });
      return blocks;
    },
  },
];
