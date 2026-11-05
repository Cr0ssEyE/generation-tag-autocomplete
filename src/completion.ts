import { tagKey, usedTags } from "./model.ts";

export interface CompletionContext {
  start: number;
  end: number;
  query: string;
}

/** A comma/newline item is the editing unit. Spaces inside tags are preserved. */
export function completionContext(
  text: string,
  selection: [number, number],
): CompletionContext | null {
  const [cursor, end] = selection;
  if (
    !selection.every(Number.isInteger) ||
    cursor < 0 ||
    end < cursor ||
    end > text.length
  )
    return null;
  if (/[,\r\n]/.test(text.slice(cursor, end))) return null;

  // Avoid suggesting inside a manually written group, including groups containing commas.
  const stack: string[] = [];
  for (const character of text.slice(0, cursor)) {
    if ("([{".includes(character)) stack.push(character);
    else if (")]}".includes(character)) stack.pop();
  }
  if (stack.length) return null;
  let start = cursor,
    stop = end;
  while (start > 0 && !/[,\r\n]/.test(text[start - 1])) start--;
  while (stop < text.length && !/[,\r\n]/.test(text[stop])) stop++;
  const item = text.slice(start, stop);
  if (/[()[\]{}:]/.test(item)) return null;
  const query = item.trim();
  if (!query) return null;
  start += item.length - item.trimStart().length;
  return { start, end: start + query.length, query };
}

export function completionState(
  text: string,
  context: CompletionContext,
  tag: string,
): "available" | "matching" | "used" {
  if (tagKey(context.query) === tagKey(tag)) return "matching";
  const rest = text.slice(0, context.start) + text.slice(context.end);
  return usedTags(rest).has(tagKey(tag)) ? "used" : "available";
}

export function completeTag(
  text: string,
  selection: [number, number],
  context: CompletionContext,
  tag: string,
) {
  const current = completionContext(text, selection);
  if (
    !current ||
    current.start !== context.start ||
    current.end !== context.end ||
    current.query !== context.query ||
    completionState(text, context, tag) !== "available"
  )
    return null;
  const cursor = context.start + tag.length;
  return {
    text: text.slice(0, context.start) + tag + text.slice(context.end),
    selection: [cursor, cursor] as [number, number],
  };
}
