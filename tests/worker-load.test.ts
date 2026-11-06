import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { indexRows, search, browse, type Row } from "../src/model.ts";

test("a slower previous dictionary load cannot overwrite the newer worker index", async () => {
  const pending = new Map<string, (rows: Row[]) => void>();
  const replies: any[] = [];
  const self: any = { postMessage: (message: any) => replies.push(message) };
  const source = readFileSync(
    new URL("../src/dictionary.worker.ts", import.meta.url),
    "utf8",
  ).replace(/^import[\s\S]*?from "[^"\n]+";\s*/gm, "");
  runInNewContext(stripTypeScriptTypes(source), {
    self,
    indexRows,
    search,
    browse,
    performance,
    get: (_store: string, id: string) =>
      new Promise((resolve) => pending.set(id, resolve)),
  });
  const old = self.onmessage({
    data: { kind: "load", id: 1, dictionaryId: "old" },
  });
  const latest = self.onmessage({
    data: { kind: "load", id: 2, dictionaryId: "new" },
  });
  pending.get("new")!([
    { tag: "new tag", category: 0, count: 1, description: "합성" },
  ]);
  await latest;
  pending.get("old")!([
    { tag: "old tag", category: 0, count: 1, description: "합성" },
  ]);
  await old;
  await self.onmessage({
    data: { kind: "search", id: 3, query: "tag", filter: "" },
  });
  assert.deepEqual(
    replies.filter((reply) => reply.kind === "loaded").map((reply) => reply.id),
    [2],
  );
  assert.equal(replies.at(-1).rows[0].tag, "new tag");
});
