import { parseCSV } from "./csv.ts";
import { get, putDictionary } from "./storage.ts";
import {
  indexRows,
  search,
  browse,
  type Dictionary,
  type Row,
  type SearchRow,
} from "./model.ts";
let indexed: SearchRow[] = [];
let loadGeneration = 0;
const send = (value: unknown) => self.postMessage(value);
self.onmessage = async (event: MessageEvent) => {
  const { kind, id } = event.data;
  try {
    if (kind === "load") {
      const generation = ++loadGeneration;
      indexed = [];
      const rows = event.data.dictionaryId
        ? await get<Row[]>("rows", event.data.dictionaryId)
        : [];
      if (generation !== loadGeneration) return;
      indexed = indexRows(rows ?? []);
      send({ kind: "loaded", id });
    }
    if (kind === "search") {
      const start = performance.now();
      const rows = search(indexed, event.data.query, event.data.filter);
      send({ kind: "results", id, rows, elapsed: performance.now() - start });
    }
    if (kind === "browse") {
      const rows = event.data.query?.trim()
        ? search(indexed, event.data.query, event.data.filter)
        : browse(indexed, event.data.filter);
      send({ kind: "browse-results", id, rows });
    }
    if (kind === "import") {
      ++loadGeneration;
      const file = event.data.file as File;
      send({ kind: "progress", id, message: "UTF-8 파일 읽는 중…" });
      const bytes = await file.arrayBuffer();
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const { rows, report } = parseCSV(text, (n) =>
        send({
          kind: "progress",
          id,
          message: `${n.toLocaleString()}개 레코드 확인 중…`,
        }),
      );
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const meta: Dictionary = {
        id: event.data.replaceId ?? crypto.randomUUID(),
        name: file.name,
        filename: file.name,
        fingerprint: Array.from(new Uint8Array(digest), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join(""),
        count: rows.length,
        categories: [...new Set(rows.map((r) => r.category))].sort(
          (a, b) => a - b,
        ),
        updatedAt: new Date().toISOString(),
      };
      const next = indexRows(rows);
      // Ready is a two-phase boundary: cancellation terminates the worker before this commit.
      send({ kind: "ready", id, meta, report });
      const onCommit = (ev: MessageEvent) => {
        if (ev.data.kind === "commit" && ev.data.id === id) {
          self.removeEventListener("message", onCommit);
          void putDictionary(meta, rows)
            .then(() => {
              indexed = next;
              send({ kind: "imported", id, meta, report });
            })
            .catch(() =>
              send({
                kind: "error",
                id,
                message:
                  "사전 저장 실패. 저장 공간과 브라우저 권한을 확인하세요.",
              }),
            );
        }
      };
      self.addEventListener("message", onCommit);
    }
  } catch {
    send({
      kind: "error",
      id,
      message:
        kind === "import"
          ? "CSV 형식 또는 UTF-8 인코딩 오류입니다. 기존 사전을 보존했습니다."
          : "사전을 준비하지 못했습니다. 다시 선택해 주세요.",
    });
  }
};
