import type { AppData, Side } from "./model.ts";

export interface SavedPromptText {
  name: string;
  positive: string;
  negative: string;
}

/** Publish the new state only after the existing transactional store accepts it. */
export async function loadPromptDraft(
  current: AppData,
  prompt: SavedPromptText,
  persist: (next: AppData) => Promise<void>,
) {
  const next = structuredClone(current);
  for (const side of ["positive", "negative"] as Side[]) {
    next.draft[side] = prompt[side];
    next.draft.selection[side] = [prompt[side].length, prompt[side].length];
  }
  await persist(next);
  return next;
}
