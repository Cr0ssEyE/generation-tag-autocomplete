import { test } from "node:test";
import assert from "node:assert/strict";
import {
  completionContext,
  completionState,
  completeTag,
} from "../src/completion.ts";
import { indexRows, browse } from "../src/model.ts";

test("current comma/newline item preserves tag spaces and surrounding whitespace", () => {
  const text = "1girl,  blue e  ,\n sunlight";
  const context = completionContext(text, [12, 12])!;
  assert.deepEqual(context, { start: 8, end: 14, query: "blue e" });
  assert.equal(
    completeTag(text, [12, 12], context, "blue eyes")?.text,
    "1girl,  blue eyes  ,\n sunlight",
  );
  assert.deepEqual(completionContext("a, 여자1명", [7, 7]), {
    start: 3,
    end: 7,
    query: "여자1명",
  });
});
test("manual groups, weights, empty items and selections across delimiters stay unchanged", () => {
  for (const text of [
    "(blue e:1.2)",
    "(1girl, blue e",
    "[blue e]",
    "{blue e}",
    "1girl, ",
    "1girl\n",
    "https://example.com",
  ])
    assert.equal(completionContext(text, [text.length, text.length]), null);
  assert.equal(completionContext("blue e, sunlight", [2, 12]), null);
  assert.equal(completionContext("blue e", [-1, 2]), null);
  assert.equal(completionContext("blue e", [0, 99]), null);
  assert.equal(
    completionContext("(1girl:1.2), blue e", [18, 18])?.query,
    "blue e",
  );
});
test("duplicates elsewhere, already complete items, and stale candidate selection cannot replace text", () => {
  const text = "blue eyes, blue e",
    selection: [number, number] = [17, 17];
  const context = completionContext(text, selection)!;
  assert.equal(completionState(text, context, "blue eyes"), "used");
  assert.equal(completeTag(text, selection, context, "blue eyes"), null);
  const exact = completionContext("blue eyes", [9, 9])!;
  assert.equal(completionState("blue eyes", exact, "blue eyes"), "matching");
  assert.equal(completeTag("blue eyes", [9, 9], exact, "blue eyes"), null);
  const old = completionContext("blue e", [6, 6])!;
  assert.equal(completeTag("sunlight", [8, 8], old, "blue eyes"), null);
});
test("completion supports selecting within an item and changing the active editor independently", () => {
  const context = completionContext("blue e", [0, 4])!;
  const result = completeTag("blue e", [0, 4], context, "blue eyes")!;
  assert.deepEqual(result, { text: "blue eyes", selection: [9, 9] });
  const positive = "1girl, blue e",
    negative = "sun";
  assert.equal(
    completeTag(
      negative,
      [3, 3],
      completionContext(negative, [3, 3])!,
      "sunlight",
    )?.text,
    "sunlight",
  );
  assert.equal(positive, "1girl, blue e");
});
test("type browsing requires an explicit type and orders by count then tag", () => {
  const rows = indexRows([
    { tag: "b", category: 0, count: 2, description: "" },
    { tag: "a", category: 0, count: 2, description: "" },
    { tag: "c", category: 4, count: 9, description: "" },
  ]);
  assert.deepEqual(
    browse(rows, "").map((x) => x.tag),
    [],
  );
  assert.deepEqual(
    browse(rows, "0").map((x) => x.tag),
    ["a", "b"],
  );
  assert.deepEqual(
    browse(rows, "4").map((x) => x.tag),
    ["c"],
  );
});
