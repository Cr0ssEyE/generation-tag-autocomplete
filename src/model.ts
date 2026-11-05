export type Side = "positive" | "negative";
export interface Row {
  tag: string;
  category: number;
  count: number;
  description: string;
}
export interface Dictionary {
  id: string;
  name: string;
  filename: string;
  fingerprint: string;
  count: number;
  categories: number[];
  updatedAt: string;
}
export interface History {
  tag: string;
  usedAt: string;
  uses: number;
}
export interface SavedPrompt {
  id: string;
  name: string;
  positive: string;
  negative: string;
  createdAt: string;
  updatedAt: string;
}
export interface TagGroup {
  id: string;
  name: string;
  tags: string[];
}
export interface AppData {
  draft: {
    positive: string;
    negative: string;
    target: Side;
    selection: { positive: [number, number]; negative: [number, number] };
  };
  prompts: SavedPrompt[];
  favorites: { tag: string; addedAt: string }[];
  tagGroups: TagGroup[];
  history: History[];
  settings: {
    dictionaryId: string | null;
    filter: string;
    tab: "bookmarks" | "search" | "history";
  };
}
export const APP_ID = "generation-tag-autocomplete";
export const freshData = (): AppData => ({
  draft: {
    positive: "",
    negative: "",
    target: "positive",
    selection: { positive: [0, 0], negative: [0, 0] },
  },
  prompts: [],
  favorites: [],
  tagGroups: [],
  history: [],
  settings: { dictionaryId: null, filter: "", tab: "bookmarks" },
});
export const normalize = (s: string) => s.normalize("NFC").trim().toLowerCase();
export const compact = (s: string) => normalize(s).replace(/\s/gu, "");
export const tagKey = (s: string) => s.normalize("NFC").trim();
export const usedTags = (s: string) =>
  new Set(
    s
      .split(/[,\r\n]/)
      .map(tagKey)
      .filter(Boolean),
  );
export function insertTags(
  text: string,
  selection: [number, number],
  tags: string[],
) {
  const used = usedTags(text);
  const inserted: string[] = [];
  for (const tag of tags)
    if (!used.has(tagKey(tag))) {
      used.add(tagKey(tag));
      inserted.push(tag);
    }
  if (!inserted.length) return { text, selection, inserted };
  const valid =
    selection.every(Number.isInteger) &&
    selection[0] >= 0 &&
    selection[1] >= selection[0] &&
    selection[1] <= text.length;
  const [start, end] = valid ? selection : [text.length, text.length];
  const left = text.slice(0, start),
    right = text.slice(end);
  const prefix =
    left && !/[,\n\r]\s*$/.test(left) ? ", " : left.endsWith(",") ? " " : "";
  const suffix = right && !/^\s*[,\n\r]/.test(right) ? ", " : "";
  const addition = prefix + inserted.join(", ") + suffix;
  const cursor = left.length + addition.length;
  return {
    text: left + addition + right,
    selection: [cursor, cursor] as [number, number],
    inserted,
  };
}
export function recordUsage(
  history: History[],
  tags: string[],
  now = new Date().toISOString(),
) {
  const copy = history.map((x) => ({ ...x }));
  for (const tag of tags) {
    const item = copy.find((x) => x.tag === tag);
    if (item) {
      item.usedAt = now;
      item.uses++;
    } else copy.push({ tag, usedAt: now, uses: 1 });
  }
  return copy.sort((a, b) => b.usedAt.localeCompare(a.usedAt)).slice(0, 1000);
}
export interface SearchRow extends Row {
  normalizedTag: string;
  compactTag: string;
  normalizedDescription: string;
  compactDescription: string;
}
export const indexRows = (rows: Row[]): SearchRow[] =>
  rows.map((row) => ({
    ...row,
    normalizedTag: normalize(row.tag),
    compactTag: compact(row.tag),
    normalizedDescription: normalize(row.description),
    compactDescription: compact(row.description),
  }));
export function search(
  rows: SearchRow[],
  query: string,
  filter: string,
  limit = 20,
): Row[] {
  const q = normalize(query),
    c = compact(query);
  if (!q) return [];
  const hits: { row: SearchRow; rank: number }[] = [];
  for (const row of rows) {
    if (filter !== "" && row.category !== Number(filter)) continue;
    let rank = 5;
    if (row.normalizedTag === q || row.compactTag === c) rank = 0;
    else if (row.normalizedTag.startsWith(q) || row.compactTag.startsWith(c))
      rank = 1;
    else if (row.normalizedTag.includes(q) || row.compactTag.includes(c))
      rank = 2;
    else if (
      row.normalizedDescription.includes(q) ||
      row.compactDescription.includes(c)
    )
      rank = 3;
    if (rank === 5) continue;
    hits.push({ row, rank });
    hits.sort(
      (a, b) =>
        a.rank - b.rank ||
        b.row.count - a.row.count ||
        (a.row.tag < b.row.tag ? -1 : a.row.tag > b.row.tag ? 1 : 0),
    );
    if (hits.length > limit) hits.pop();
  }
  return hits.map(({ row }) => ({
    tag: row.tag,
    category: row.category,
    count: row.count,
    description: row.description,
  }));
}

/** Browse only an explicitly selected type; an empty query never dumps every row. */
export function browse(rows: SearchRow[], filter: string, limit = 20): Row[] {
  if (!/^\d+$/.test(filter)) return [];
  return rows
    .filter((row) => row.category === Number(filter))
    .sort(
      (a, b) =>
        b.count - a.count || (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0),
    )
    .slice(0, limit)
    .map(({ tag, category, count, description }) => ({
      tag,
      category,
      count,
      description,
    }));
}
