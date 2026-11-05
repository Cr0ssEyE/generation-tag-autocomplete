import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshData, type Dictionary, type Row } from "../src/model.ts";
import {
  get,
  loadApp,
  saveApp,
  putDictionary,
  removeDictionary,
  listDictionaries,
} from "../src/storage.ts";
test("dictionary transaction rollback, independent data lifetime and stale-tab writes", async () => {
  await loadApp();
  const data = freshData();
  data.draft.positive = "blue eyes";
  data.favorites = [{ tag: "blue eyes", addedAt: new Date().toISOString() }];
  await saveApp(data);
  const dictionary: Dictionary = {
    id: "test",
    name: "synthetic",
    filename: "synthetic.csv",
    fingerprint: "b".repeat(64),
    count: 1,
    categories: [0],
    updatedAt: new Date().toISOString(),
  };
  const rows: Row[] = [
    {
      tag: "blue eyes",
      category: 0,
      count: 900,
      description: "공개 합성 설명",
    },
  ];
  await putDictionary(dictionary, rows);
  await assert.rejects(() =>
    putDictionary({ ...dictionary, name: "should roll back" }, [
      { ...rows[0], unsafe: () => 0 },
    ] as Row[]),
  );
  assert.equal((await listDictionaries())[0].name, "synthetic");
  assert.deepEqual(await get("rows", "test"), rows);
  await removeDictionary("test");
  assert.equal((await listDictionaries()).length, 0);
  assert.deepEqual(await get("app", "current"), data);
  // Separate module instance represents another browsing context with an older version.
  const other = await import("../src/storage.ts?another-tab");
  await other.loadApp();
  const next = structuredClone(data);
  next.draft.positive = "outdoors";
  await saveApp(next);
  await assert.rejects(() => other.saveApp(data), /다른 탭/);
  assert.equal(
    (await get<typeof data>("app", "current"))?.draft.positive,
    "outdoors",
  );
});
