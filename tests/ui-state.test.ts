import { test } from "node:test";
import assert from "node:assert/strict";
import { LatestSearch } from "../src/latest-search.ts";
import { freshData } from "../src/model.ts";
import { loadPromptDraft } from "../src/prompt-load.ts";
import {
  applyCompletionIntent,
  type CompletionIntent,
} from "../src/ime-completion.ts";

test("slow search runs only the newest queued query; stale replies cannot release the next request", () => {
  const sent: { id: number; query: string }[] = [];
  const queue = new LatestSearch<{ id: number; query: string }>((request) =>
    sent.push(request),
  );
  queue.submit({ id: 1, query: "여" });
  queue.submit({ id: 2, query: "여자" });
  queue.submit({ id: 3, query: "여자1명" });
  assert.deepEqual(
    sent.map((x) => x.id),
    [1],
  );
  queue.finish(99);
  queue.finish(1);
  assert.deepEqual(
    sent.map((x) => x.id),
    [1, 3],
  );
  queue.submit({ id: 4, query: "파란" });
  queue.finish(1);
  assert.equal(sent.length, 2);
  queue.clear();
  queue.finish(3);
  assert.equal(sent.length, 2);
  queue.reset();
  queue.submit({ id: 5, query: "sun" });
  assert.equal(sent.at(-1)?.id, 5);
});

test("composition selection accepts the final collapsed caret but rejects changed text, target, dictionary or item", () => {
  const intent: CompletionIntent = {
    text: "start, 여자1명, end",
    side: "positive",
    dictionary: "sample",
    context: { start: 7, end: 11, query: "여자1명" },
    tag: "1girl",
  };
  const next = applyCompletionIntent(
    intent,
    intent.text,
    [11, 11],
    "positive",
    "sample",
  );
  assert.equal(next?.text, "start, 1girl, end");
  assert.equal(
    applyCompletionIntent(
      intent,
      intent.text + "!",
      [11, 11],
      "positive",
      "sample",
    ),
    null,
  );
  assert.equal(
    applyCompletionIntent(intent, intent.text, [11, 11], "negative", "sample"),
    null,
  );
  assert.equal(
    applyCompletionIntent(intent, intent.text, [11, 11], "positive", "other"),
    null,
  );
  assert.equal(
    applyCompletionIntent(intent, intent.text, [1, 1], "positive", "sample"),
    null,
  );
});

test("prompt load waits for persistence, clears an empty negative and preserves unrelated personal data", async () => {
  const current = freshData();
  current.draft.positive = "existing positive";
  current.draft.negative = "existing negative";
  current.draft.target = "negative";
  current.history = [
    { tag: "blue eyes", uses: 2, usedAt: "2026-11-06T00:00:00Z" },
  ];
  const original = structuredClone(current);
  let release!: () => void;
  const pending = loadPromptDraft(
    current,
    { name: "synthetic", positive: "sunlight", negative: "" },
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  assert.deepEqual(current, original);
  release();
  const next = await pending;
  assert.deepEqual(current, original);
  assert.equal(next.draft.negative, "");
  assert.deepEqual(next.draft.selection.negative, [0, 0]);
  assert.equal(next.draft.target, "negative");
  assert.deepEqual(next.history, current.history);
  await assert.rejects(() =>
    loadPromptDraft(
      current,
      { name: "synthetic", positive: "", negative: "" },
      async () => {
        throw new Error("quota or stale tab");
      },
    ),
  );
  assert.deepEqual(current, original);
});
