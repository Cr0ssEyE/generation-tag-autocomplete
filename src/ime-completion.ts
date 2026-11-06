import { completeTag, type CompletionContext } from "./completion.ts";
import { insertTags, type Side } from "./model.ts";

export interface InsertionIntent {
  text: string;
  side: Side;
  dictionary: string | null;
  tags: string[];
}

export function applyInsertionIntent(
  intent: InsertionIntent,
  text: string,
  selection: [number, number],
  side: Side,
  dictionary: string | null,
) {
  if (
    text !== intent.text ||
    side !== intent.side ||
    dictionary !== intent.dictionary
  )
    return null;
  return insertTags(text, selection, intent.tags);
}

export interface CompletionIntent {
  text: string;
  side: Side;
  dictionary: string | null;
  context: CompletionContext;
  tag: string;
}

/** A real composition end may collapse the selection; it must not change the item. */
export function applyCompletionIntent(
  intent: CompletionIntent,
  text: string,
  selection: [number, number],
  side: Side,
  dictionary: string | null,
) {
  if (
    text !== intent.text ||
    side !== intent.side ||
    dictionary !== intent.dictionary
  )
    return null;
  return completeTag(text, selection, intent.context, intent.tag);
}
