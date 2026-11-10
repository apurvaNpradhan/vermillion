export type NoteSegment = { text: string; url: string | null };

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>]+/gi;
const TRAILING = /[.,;:!?)\]'"]+$/;

/** Splits a note into plain text and links; trailing punctuation stays outside a link. */
export function splitLinks(note: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
  let from = 0;
  for (const match of note.matchAll(LINK)) {
    const raw = match[0];
    const link = raw.replace(TRAILING, "");
    const start = match.index;
    if (start > from) segments.push({ text: note.slice(from, start), url: null });
    segments.push({ text: link, url: /^www\./i.test(link) ? `https://${link}` : link });
    from = start + link.length;
  }
  if (from < note.length) segments.push({ text: note.slice(from), url: null });
  return segments;
}
