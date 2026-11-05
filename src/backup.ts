import { APP_ID, type AppData, type Dictionary } from "./model.ts";
export interface Backup {
  appId: string;
  schemaVersion: number;
  exportedAt: string;
  data: AppData & { dictionaries: Dictionary[] };
}
export function makeBackup(data: AppData, dictionaries: Dictionary[]): Backup {
  return {
    appId: APP_ID,
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      ...structuredClone(data),
      dictionaries: structuredClone(dictionaries),
    },
  };
}
export function validateBackup(input: unknown, local: Dictionary[]): AppData {
  const assert = (value: unknown): void => {
    if (!value)
      throw new Error(
        "지원하지 않거나 손상된 백업입니다. 기존 데이터는 보존됩니다.",
      );
  };
  const object = (v: unknown): v is Record<string, any> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  const str = (v: unknown): v is string => typeof v === "string";
  const date = (v: unknown) => str(v) && Number.isFinite(Date.parse(v));
  assert(object(input));
  const b = input as Record<string, any>;
  assert(
    b.appId === APP_ID &&
      b.schemaVersion === 1 &&
      date(b.exportedAt) &&
      object(b.data),
  );
  const d = b.data as AppData & { dictionaries: Dictionary[] };
  assert(
    object(d.draft) &&
      str(d.draft.positive) &&
      str(d.draft.negative) &&
      ["positive", "negative"].includes(d.draft.target),
  );
  assert(object(d.draft.selection));
  for (const side of ["positive", "negative"] as const) {
    const s = d.draft.selection[side];
    assert(
      Array.isArray(s) &&
        s.length === 2 &&
        s.every((n) => Number.isSafeInteger(n) && n >= 0) &&
        s[0] <= s[1] &&
        s[1] <= d.draft[side].length,
    );
  }
  assert(
    object(d.settings) &&
      (d.settings.dictionaryId === null || str(d.settings.dictionaryId)) &&
      str(d.settings.filter) &&
      ["bookmarks", "search", "history"].includes(d.settings.tab),
  );
  const unique = (arr: any[], key: string) =>
    new Set(arr.map((x) => x[key])).size === arr.length;
  assert(
    Array.isArray(d.prompts) &&
      d.prompts.every(
        (x) =>
          object(x) &&
          str(x.id) &&
          str(x.name) &&
          str(x.positive) &&
          str(x.negative) &&
          date(x.createdAt) &&
          date(x.updatedAt),
      ) &&
      unique(d.prompts, "id"),
  );
  const tag = (v: unknown) =>
    str(v) && v.trim().length > 0 && !/[,\r\n]/.test(v);
  assert(
    Array.isArray(d.favorites) &&
      d.favorites.every((x) => object(x) && tag(x.tag) && date(x.addedAt)) &&
      unique(d.favorites, "tag"),
  );
  assert(
    Array.isArray(d.history) &&
      d.history.length <= 1000 &&
      d.history.every(
        (x) =>
          object(x) &&
          tag(x.tag) &&
          date(x.usedAt) &&
          Number.isSafeInteger(x.uses) &&
          x.uses > 0,
      ) &&
      unique(d.history, "tag"),
  );
  assert(
    Array.isArray(d.tagGroups) &&
      d.tagGroups.every(
        (x) =>
          object(x) &&
          str(x.id) &&
          str(x.name) &&
          Array.isArray(x.tags) &&
          x.tags.every(tag),
      ) &&
      unique(d.tagGroups, "id"),
  );
  assert(
    Array.isArray(d.dictionaries) &&
      d.dictionaries.every(
        (x) =>
          object(x) &&
          str(x.id) &&
          str(x.name) &&
          str(x.filename) &&
          /^[a-f0-9]{64}$/.test(x.fingerprint) &&
          Number.isSafeInteger(x.count) &&
          x.count > 0 &&
          Array.isArray(x.categories) &&
          x.categories.every((c) => Number.isSafeInteger(c) && c >= 0) &&
          date(x.updatedAt),
      ) &&
      unique(d.dictionaries, "id"),
  );
  const selected = d.dictionaries.find((x) => x.id === d.settings.dictionaryId);
  assert(d.settings.dictionaryId === null || selected);
  const linked = selected
    ? local.find((x) => x.fingerprint === selected.fingerprint)
    : undefined;
  // Construct only known fields; CSV rows and arbitrary injected fields never enter app state.
  return {
    draft: {
      positive: d.draft.positive,
      negative: d.draft.negative,
      target: d.draft.target,
      selection: {
        positive: [...d.draft.selection.positive],
        negative: [...d.draft.selection.negative],
      },
    },
    prompts: d.prompts.map((x) => ({
      id: x.id,
      name: x.name,
      positive: x.positive,
      negative: x.negative,
      createdAt: x.createdAt,
      updatedAt: x.updatedAt,
    })),
    favorites: d.favorites.map((x) => ({ tag: x.tag, addedAt: x.addedAt })),
    tagGroups: d.tagGroups.map((x) => ({
      id: x.id,
      name: x.name,
      tags: [...x.tags],
    })),
    history: d.history.map((x) => ({
      tag: x.tag,
      usedAt: x.usedAt,
      uses: x.uses,
    })),
    settings: {
      dictionaryId: linked?.id ?? null,
      filter: d.settings.filter,
      tab: d.settings.tab,
    },
  };
}
