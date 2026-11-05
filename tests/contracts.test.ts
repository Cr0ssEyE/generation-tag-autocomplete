import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  freshData,
  indexRows,
  search,
  insertTags,
  recordUsage,
  usedTags,
} from "../src/model.ts";
import { parseCSV } from "../src/csv.ts";
import { makeBackup, validateBackup } from "../src/backup.ts";
const sample = readFileSync(
  new URL("../samples/tags.example.csv", import.meta.url),
  "utf8",
);
test("headerless sample preserves all 11 rows and quoted descriptions", () => {
  const { rows } = parseCSV(sample);
  assert.equal(rows.length, 11);
  assert.equal(rows[0].tag, "1girl");
  assert.match(rows[0].description, /<인원>/);
  assert.match(rows.at(-1)!.description, /"Hello"/);
});
test("single-string Korean search, whitespace, case and no underscore conversion", () => {
  const rows = indexRows(parseCSV(sample).rows);
  for (const query of ["여자1명", "여자 1명", "여성한명"])
    assert.equal(search(rows, query, "")[0]?.tag, "1girl");
  for (const q of ["여성 1명", "여자 인원수", "blue_eyes"])
    assert.equal(search(rows, q, "").length, 0);
  assert.equal(search(rows, "BLUE EYES", "")[0].tag, "blue eyes");
  assert.equal(search(rows, "예시", "4")[0].category, 4);
  assert.equal(search(rows, "", "").length, 0);
});
test("BOM, recognized headers, embedded commas/newlines, duplicates and invalid rows", () => {
  const { rows, report } = parseCSV(
    '\uFEFFtag,category,count,description\r\na,0,1,"one,two\nthree"\r\na,0,2,x\r\nb,-1,3,x\r\nc,0,3,\r\nwrong,0\r\n',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].description, "one,two\nthree");
  assert.equal(report.duplicates, 1);
  assert.equal(report.skipped, 2);
  assert.equal(rows[1].description, "");
});
test("unclosed quotes, invalid integer and zero valid rows reject", () => {
  assert.throws(() => parseCSV('a,0,1,"unterminated'));
  assert.throws(() => parseCSV("x,0,9007199254740992,a"));
  assert.throws(() => parseCSV("not,a,header,row"));
  assert.throws(() => parseCSV('"a,b",0,1,test'));
});
test("cursor insertion changes only selected range and preserves raw syntax", () => {
  assert.equal(
    insertTags("1girl, sunlight", [7, 7], ["blue eyes"]).text,
    "1girl, blue eyes, sunlight",
  );
  assert.equal(
    insertTags("start, old, end", [7, 10], ["blue eyes"]).text,
    "start, blue eyes, end",
  );
  assert.equal(
    insertTags("(1girl:1.2)", [11, 11], ["blue eyes"]).text,
    "(1girl:1.2), blue eyes",
  );
  assert.equal(
    insertTags("1girl, ", [7, 7], ["blue eyes"]).text,
    "1girl, blue eyes",
  );
  assert.equal(insertTags("", [0, 0], ["blue eyes"]).text, "blue eyes");
});
test("duplicate matching is exact; groups omit used tags without history increments", () => {
  assert(usedTags("blue eyes, 1girl\noutdoors").has("blue eyes"));
  assert(!usedTags("bright blue eyes").has("blue eyes"));
  const result = insertTags(
    "blue eyes",
    [9, 9],
    ["blue eyes", "outdoors", "outdoors"],
  );
  assert.deepEqual(result.inserted, ["outdoors"]);
  assert.equal(result.text, "blue eyes, outdoors");
  assert.equal(
    recordUsage(
      [{ tag: "blue eyes", uses: 1, usedAt: "2020-01-01" }],
      result.inserted,
    )[0].tag,
    "outdoors",
  );
});
test("backup round trip excludes CSV and reconnects only by fingerprint", () => {
  const d = freshData();
  d.draft.positive = "blue eyes";
  d.settings.dictionaryId = "old";
  const meta = {
    id: "old",
    name: "sample",
    filename: "sample.csv",
    fingerprint: "a".repeat(64),
    count: 11,
    categories: [0],
    updatedAt: new Date().toISOString(),
  };
  const b = makeBackup(d, [meta]);
  assert(!JSON.stringify(b).includes("description"));
  assert.equal(
    validateBackup(b, [{ ...meta, id: "local" }]).settings.dictionaryId,
    "local",
  );
  assert.equal(validateBackup(b, []).settings.dictionaryId, null);
  assert.equal(validateBackup(b, []).draft.positive, "blue eyes");
});
test("malformed and future backups reject before any data can be written", () => {
  const d = freshData();
  const original = JSON.stringify(d);
  for (const bad of [
    {},
    { ...makeBackup(d, []), schemaVersion: 2 },
    { ...makeBackup(d, []), appId: "other" },
    {
      ...makeBackup(d, []),
      data: { ...d, history: [{ tag: "x", uses: -1, usedAt: "bad" }] },
    },
    {
      ...makeBackup(d, []),
      data: { ...d, settings: { ...d.settings, dictionaryId: "missing" } },
    },
  ])
    assert.throws(() => validateBackup(bad, []));
  assert.equal(JSON.stringify(d), original);
});
