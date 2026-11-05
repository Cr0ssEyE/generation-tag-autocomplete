import "./style.css";
import sampleCSV from "../samples/tags.example.csv?raw";
import {
  freshData,
  insertTags,
  recordUsage,
  usedTags,
  type AppData,
  type Dictionary,
  type Row,
  type Side,
} from "./model.ts";
import {
  loadApp,
  listDictionaries,
  removeDictionary,
  saveApp,
  StorageConflictError,
} from "./storage.ts";
import { makeBackup, validateBackup } from "./backup.ts";
import { view } from "./view.ts";
import {
  completionContext,
  completionState,
  completeTag,
  type CompletionContext,
} from "./completion.ts";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const esc = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const fmt = (n: number) => n.toLocaleString("ko-KR");
let data: AppData = freshData(),
  dictionaries: Dictionary[] = [],
  results: Row[] = [];
let worker: Worker,
  seq = 0,
  latest = 0,
  loading = false,
  importId = 0,
  searchTimer = 0,
  saveTimer = 0,
  revision = 0,
  savedRevision = 0;
let saveQueue = Promise.resolve(),
  readyToSave = false,
  composing = false;
let waitingSW: ServiceWorker | null = null;
let inlineRows: Row[] = [],
  inlineContext: CompletionContext | null = null;
let latestInline = 0,
  inlineTimer = 0,
  inlineComposing = false;
let inlineSide: Side = "positive";
let inlinePending = false;
const undoStack: Record<Side, { text: string; selection: [number, number] }[]> =
  { positive: [], negative: [] };
const labels: Record<string, string> = {
  "0": "일반",
  "1": "작가",
  "3": "작품",
  "4": "캐릭터",
  "5": "메타",
};

$("app").innerHTML = view;

let noticeTimer = 0;
function notice(message: string, error = false) {
  clearTimeout(noticeTimer);
  $("notice").textContent = message;
  $("notice").hidden = false;
  $("notice").classList.toggle("error", error);
  const close = document.createElement("button");
  close.className = "notice-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "알림 닫기");
  close.onclick = () => {
    $("notice").hidden = true;
  };
  $("notice").append(close);
  if (!error)
    noticeTimer = window.setTimeout(() => {
      $("notice").hidden = true;
    }, 5000);
}
function status(message: string) {
  $("save-status").textContent = message;
}
function changed() {
  revision++;
  status("저장 대기…");
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void flush(), 300);
}
async function flush() {
  clearTimeout(saveTimer);
  if (!readyToSave) return false;
  if (revision === savedRevision) {
    await saveQueue;
    return revision === savedRevision;
  }
  const snapshot = structuredClone(data),
    version = revision;
  status("저장 중…");
  let success = true;
  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      try {
        await saveApp(snapshot);
        savedRevision = version;
        if (revision === version) status("✓ 이 기기에 저장됨");
      } catch (error) {
        success = false;
        status("저장 실패 · 백업을 보관하세요");
        notice(
          error instanceof StorageConflictError
            ? error.message
            : "저장하지 못했습니다. 편집 내용을 복사하거나 JSON 백업으로 보관하세요.",
          true,
        );
      }
    });
  await saveQueue;
  return success;
}
function page(name: string) {
  document
    .querySelectorAll<HTMLElement>(".page")
    .forEach((el) => (el.hidden = el.id !== `page-${name}`));
  document
    .querySelectorAll<HTMLButtonElement>("[data-page]")
    .forEach((el) =>
      el.setAttribute(
        "aria-current",
        el.dataset.page === name ? "page" : "false",
      ),
    );
  void flush();
  if (name === "library") renderLibrary();
  if (name === "settings") void storageInfo();
}
function renderTarget() {
  for (const side of ["positive", "negative"] as const) {
    const active = data.draft.target === side;
    $(`block-${side}`).hidden = !active;
    const tab = $<HTMLButtonElement>(`target-${side}`);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
    document.querySelector<HTMLButtonElement>(
      `[data-undo="${side}"]`,
    )!.disabled = !undoStack[side].length;
    $(`${side}-count`).textContent = `${fmt(data.draft[side].length)}자`;
  }
  $("target-label").textContent =
    data.draft.target === "positive" ? "긍정" : "부정";
  renderResults();
}
function syncEditors() {
  for (const side of ["positive", "negative"] as const) {
    const box = $<HTMLTextAreaElement>(side);
    const scroll = box.scrollTop;
    if (box.value !== data.draft[side]) box.value = data.draft[side];
    const [start, end] = data.draft.selection[side];
    box.setSelectionRange(start, end);
    box.scrollTop = scroll;
  }
  renderTarget();
}
function renderTabs() {
  for (const [id, value] of [
    ["bookmark-tab", "bookmarks"],
    ["search-tab", "search"],
    ["history-tab", "history"],
  ]) {
    const tab = $<HTMLButtonElement>(id),
      active = data.settings.tab === value;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  $("search-controls").hidden = data.settings.tab !== "search";
  $("history-controls").hidden = data.settings.tab !== "history";
  $("history-count").textContent = fmt(data.history.length);
  renderResults();
}
function rowHTML(
  row: Row | { tag: string; uses?: number },
  history = false,
  completing = false,
) {
  const state =
    completing && inlineContext
      ? completionState(data.draft[data.draft.target], inlineContext, row.tag)
      : null;
  const used = state
    ? state !== "available"
    : usedTags(data.draft[data.draft.target]).has(
        row.tag.normalize("NFC").trim(),
      );
  const favorite = data.favorites.some((x) => x.tag === row.tag);
  const metadata =
    "category" in row
      ? `${esc(labels[row.category] ?? `유형 ${row.category}`)} · ${fmt(row.count)}`
      : "uses" in row
        ? `${fmt(row.uses ?? 0)}회 사용`
        : "";
  return `<article class="tag-row">
    <div class="tag-top"><div class="tag-title"><strong>${esc(row.tag)}</strong><span class="meta">${metadata}</span></div>
      <button class="star ${favorite ? "is-favorite" : ""}" data-favorite="${esc(row.tag)}" aria-label="${esc(row.tag)} 북마크" aria-pressed="${favorite}">${favorite ? "★" : "☆"}</button>
      <button class="add-button" ${completing ? "data-complete" : "data-insert"}="${esc(row.tag)}" ${used ? "disabled" : ""}>${state === "matching" ? "일치" : used ? "사용 중" : completing ? "대체" : "+ 추가"}</button>
      ${history ? `<button class="icon-button" data-history-delete="${esc(row.tag)}" aria-label="${esc(row.tag)} 기록 삭제">×</button>` : ""}
    </div>
    ${"description" in row ? `<details class="description"><summary>${esc(row.description || "설명 없음")}</summary><p>${esc(row.description || "설명 없음")}</p></details>` : ""}
  </article>`;
}
function renderResults() {
  let html = "";
  if (data.settings.tab === "history")
    html =
      data.history.map((row) => rowHTML(row, true)).join("") ||
      '<p class="empty-line">사용 기록이 없습니다.</p>';
  else if (data.settings.tab === "bookmarks")
    html =
      data.favorites.map((row) => rowHTML(row)).join("") ||
      '<p class="empty-line">태그 옆의 ☆로 북마크를 추가하세요.</p>';
  else if (!$<HTMLInputElement>("query").value.trim() && !data.settings.filter)
    html =
      '<p class="empty-line">유형을 선택하거나 태그·설명을 검색하세요.</p>';
  else
    html =
      results.map((row) => rowHTML(row)).join("") ||
      `<p class="empty-line">${loading ? "사전 준비 중…" : "일치하는 태그가 없습니다."}</p>`;
  $("results").innerHTML = html;
  $("history-count").textContent = fmt(data.history.length);
}
function renderInline() {
  let message = "";
  if (!data.settings.dictionaryId)
    message = "사전 관리에서 CSV를 가져오거나 선택하세요.";
  else if (loading) message = "사전 준비 중…";
  else if (inlineComposing) message = "한글 입력 확정 후 검색합니다.";
  else if (!inlineContext)
    message =
      "태그 또는 한글 설명을 입력하세요. 괄호·가중치 구문은 자동완성하지 않습니다.";
  else if (inlinePending) message = "검색 중…";
  else if (!inlineRows.length) message = "일치하는 태그가 없습니다.";
  $("completion-results").innerHTML = message
    ? `<p class="empty-line">${message}</p>`
    : inlineRows.map((row) => rowHTML(row, false, true)).join("");
  $("completion-meta").textContent = inlineContext
    ? `현재 항목: ${inlineContext.query}`
    : "현재 항목의 태그 후보";
}
function requestInline() {
  clearTimeout(inlineTimer);
  latestInline = ++seq;
  inlineRows = [];
  inlineSide = data.draft.target;
  inlineContext = completionContext(
    data.draft[inlineSide],
    data.draft.selection[inlineSide],
  );
  inlinePending =
    !inlineComposing &&
    !loading &&
    !!inlineContext &&
    !!data.settings.dictionaryId;
  renderInline();
  if (
    inlineComposing ||
    loading ||
    !inlineContext ||
    !data.settings.dictionaryId
  )
    return;
  const id = latestInline,
    query = inlineContext.query;
  inlineTimer = window.setTimeout(
    () => worker.postMessage({ kind: "search", id, query, filter: "" }),
    120,
  );
}
function rememberUndo(side: Side) {
  undoStack[side].push({
    text: data.draft[side],
    selection: [...data.draft.selection[side]],
  });
  if (undoStack[side].length > 20) undoStack[side].shift();
}
function complete(tag: string) {
  if (inlineComposing || inlineSide !== data.draft.target || !inlineContext)
    return;
  const side = data.draft.target;
  const next = completeTag(
    data.draft[side],
    data.draft.selection[side],
    inlineContext,
    tag,
  );
  if (!next) return;
  rememberUndo(side);
  data.draft[side] = next.text;
  data.draft.selection[side] = next.selection;
  data.history = recordUsage(data.history, [tag]);
  syncEditors();
  changed();
  requestInline();
  $<HTMLTextAreaElement>(side).focus({ preventScroll: true });
}
function insert(tags: string[]) {
  const side = data.draft.target;
  const result = insertTags(data.draft[side], data.draft.selection[side], tags);
  if (!result.inserted.length) {
    notice("현재 편집기에 이미 사용 중인 태그입니다.");
    return;
  }
  rememberUndo(side);
  data.draft[side] = result.text;
  data.draft.selection[side] = result.selection;
  data.history = recordUsage(data.history, result.inserted);
  syncEditors();
  changed();
  requestInline();
  notice(
    `${result.inserted.length}개 태그를 ${side === "positive" ? "긍정" : "부정"} 프롬프트에 추가했습니다.`,
  );
}
function requestSearch() {
  clearTimeout(searchTimer);
  if (composing) return;
  const query = $<HTMLInputElement>("query").value;
  latest = ++seq;
  results = [];
  renderResults();
  if (
    loading ||
    !data.settings.dictionaryId ||
    (!query.trim() && !data.settings.filter)
  )
    return;
  const id = latest,
    filter = data.settings.filter;
  searchTimer = window.setTimeout(
    () => worker.postMessage({ kind: "browse", id, query, filter }),
    120,
  );
}

function startWorker() {
  worker = new Worker(new URL("./dictionary.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onerror = () => {
    loading = false;
    notice(
      "사전 작업이 중단되었습니다. 다시 선택하거나 파일을 다시 가져오세요.",
      true,
    );
  };
  worker.onmessage = async ({ data: message }) => {
    if (message.kind === "progress" && message.id === importId)
      $("import-status").textContent = message.message;
    if (message.kind === "ready" && message.id === importId) {
      $("cancel-import").hidden = true;
      $("import-status").textContent = "검증 완료 · 저장 중…";
      worker.postMessage({ kind: "commit", id: importId });
    }
    if (message.kind === "imported" && message.id === importId) {
      loading = false;
      data.settings.dictionaryId = message.meta.id;
      dictionaries = await listDictionaries();
      renderDictionaries();
      changed();
      requestSearch();
      requestInline();
      $("import-status").textContent =
        `완료 · ${fmt(message.report.valid)}개 태그 / 건너뜀 ${fmt(message.report.skipped)} / 중복 ${fmt(message.report.duplicates)}`;
      $("import-details").hidden = false;
      $("import-report").textContent = JSON.stringify(message.report, null, 2);
      notice("사전을 이 기기에 저장했습니다.");
      setImportDisabled(false);
    }
    if (message.kind === "loaded") {
      loading = false;
      requestSearch();
      requestInline();
    }
    if (message.kind === "browse-results" && message.id === latest) {
      results = message.rows;
      $("search-meta").textContent = `${results.length}개 후보`;
      renderResults();
    }
    if (message.kind === "results" && message.id === latestInline) {
      inlinePending = false;
      inlineRows = message.rows;
      renderInline();
    }
    if (message.kind === "error") {
      loading = false;
      $("cancel-import").hidden = true;
      setImportDisabled(false);
      notice(message.message, true);
      $("import-status").textContent = message.message;
    }
  };
}
function setImportDisabled(value: boolean) {
  $<HTMLInputElement>("csv-file").disabled = value;
  $<HTMLButtonElement>("load-sample").disabled = value;
  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-dictionary],[data-replace],[data-delete-dictionary]",
    )
    .forEach((x) => (x.disabled = value));
}
async function loadActive() {
  loading = true;
  latest = ++seq;
  clearTimeout(searchTimer);
  clearTimeout(inlineTimer);
  latestInline = ++seq;
  inlineRows = [];
  renderInline();
  worker.postMessage({
    kind: "load",
    id: ++seq,
    dictionaryId: data.settings.dictionaryId,
  });
}
function importFile(file: File, replaceId?: string) {
  if (loading) {
    notice("현재 사전 작업이 끝난 뒤 다시 시도하세요.");
    return;
  }
  if (!/\.csv$/i.test(file.name)) {
    notice("CSV 파일을 선택하세요.", true);
    return;
  }
  loading = true;
  importId = ++seq;
  latest = ++seq;
  latestInline = ++seq;
  inlineRows = [];
  renderInline();
  setImportDisabled(true);
  $("cancel-import").hidden = false;
  $("import-details").hidden = true;
  worker.postMessage({ kind: "import", id: importId, file, replaceId });
}
function renderDictionaries() {
  const active = dictionaries.find((x) => x.id === data.settings.dictionaryId);
  $("dictionary-label").textContent = active
    ? `${fmt(active.count)}개 태그`
    : "사전 없음";
  $<HTMLSelectElement>("type-filter").innerHTML =
    '<option value="">모든 유형</option>' +
    (active?.categories ?? [])
      .map(
        (c) => `<option value="${c}">${esc(labels[c] ?? `유형 ${c}`)}</option>`,
      )
      .join("");
  $<HTMLSelectElement>("type-filter").value = data.settings.filter;
  $("dictionary-list").innerHTML =
    dictionaries
      .map(
        (d) =>
          `<article class="panel dictionary-card"><div><h3>${esc(d.name)}</h3><p>${fmt(d.count)}개 태그 · ${new Date(d.updatedAt).toLocaleDateString("ko-KR")}</p><span class="small muted">${d.id === data.settings.dictionaryId ? "● 현재 사용 중" : "이 기기에 보관됨"}</span></div><div class="actions"><button data-dictionary="${d.id}" ${d.id === data.settings.dictionaryId ? "disabled" : ""}>선택</button><button data-replace="${d.id}">교체</button><button data-delete-dictionary="${d.id}" class="text-button danger-text">삭제</button></div></article>`,
      )
      .join("") || '<p class="empty-line">아직 보관한 사전이 없습니다.</p>';
}
function renderLibrary() {
  $("prompt-list").innerHTML =
    data.prompts
      .map(
        (p) =>
          `<article class="library-row"><strong>${esc(p.name)}</strong><p>${esc(p.positive.slice(0, 110) || "긍정 프롬프트 없음")}</p><div class="actions"><button data-load-prompt="${esc(p.id)}">불러오기</button><button data-delete-prompt="${esc(p.id)}" class="text-button">삭제</button></div></article>`,
      )
      .join("") ||
    '<p class="empty-line">마음에 드는 프롬프트를 이름과 함께 보관하세요.</p>';
  $("favorite-list").innerHTML =
    data.favorites.map((x) => rowHTML(x)).join("") ||
    '<p class="empty-line">태그 옆의 ☆를 눌러 즐겨찾으세요.</p>';
  $("group-list").innerHTML =
    data.tagGroups
      .map(
        (g) =>
          `<article class="library-row"><strong>${esc(g.name)}</strong><p>${esc(g.tags.join(", "))}</p><div class="actions"><button data-insert-group="${esc(g.id)}">묶음 추가 (${g.tags.length})</button><button data-delete-group="${esc(g.id)}" class="text-button">삭제</button></div></article>`,
      )
      .join("") ||
    '<p class="empty-line">자주 함께 쓰는 태그를 묶어 보관하세요.</p>';
}
let nameAction: "prompt" | "group" = "prompt";
function askName(action: "prompt" | "group") {
  nameAction = action;
  $("dialog-title").textContent =
    action === "prompt" ? "프롬프트 저장" : "태그 묶음 만들기";
  $<HTMLInputElement>("item-name").value = "";
  $<HTMLDialogElement>("name-dialog").showModal();
}
function exportBackup() {
  const backup = makeBackup(data, dictionaries);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const d = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  a.download = `generation-tag-autocomplete-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let pendingRestore: AppData | null = null;
async function storageInfo() {
  try {
    const estimate = await navigator.storage.estimate();
    const persisted = await navigator.storage.persisted();
    $("storage-info").textContent =
      `${((estimate.usage ?? 0) / 1048576).toFixed(1)} MB 사용 / ${((estimate.quota ?? 0) / 1048576).toFixed(0)} MB 가용 한도 · ${persisted ? "지속 저장 허용됨" : "일반 저장"}`;
  } catch {
    $("storage-info").textContent = "저장 공간 정보를 확인할 수 없습니다.";
  }
}

document.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>(
    "button,[data-go]",
  );
  if (!button || button.hasAttribute("disabled")) return;
  const ds = button.dataset;
  if (ds.page) page(ds.page);
  if (ds.go) page(ds.go);
  if (ds.target) {
    inlineComposing = false;
    data.draft.target = ds.target as Side;
    renderTarget();
    requestInline();
    changed();
  }
  if (ds.complete) complete(ds.complete);
  if (ds.undo) {
    const side = ds.undo as Side,
      previous = undoStack[side].pop();
    if (previous) {
      data.draft[side] = previous.text;
      data.draft.selection[side] = previous.selection;
      syncEditors();
      changed();
      requestInline();
    }
  }
  if (ds.insert) insert([ds.insert]);
  if (ds.favorite) {
    const existing = data.favorites.findIndex((x) => x.tag === ds.favorite);
    if (existing < 0)
      data.favorites.push({
        tag: ds.favorite,
        addedAt: new Date().toISOString(),
      });
    else data.favorites.splice(existing, 1);
    renderResults();
    renderLibrary();
    renderInline();
    changed();
  }
  if (ds.historyDelete) {
    data.history = data.history.filter((x) => x.tag !== ds.historyDelete);
    renderResults();
    changed();
  }
  if (ds.copy) {
    const side = ds.copy as Side;
    try {
      await navigator.clipboard.writeText(data.draft[side]);
      notice(
        `${side === "positive" ? "긍정" : "부정"} 프롬프트를 복사했습니다.`,
      );
    } catch {
      const box = $<HTMLTextAreaElement>(side);
      box.focus();
      box.select();
      notice(
        "자동 복사가 거부되었습니다. 선택한 본문을 길게 눌러 수동으로 복사하세요.",
        true,
      );
    }
  }
  if (ds.dictionary && !loading) {
    data.settings.dictionaryId = ds.dictionary;
    data.settings.filter = "";
    renderDictionaries();
    void loadActive();
    changed();
  }
  if (ds.replace && !loading) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.onchange = () => {
      if (input.files?.[0]) importFile(input.files[0], ds.replace);
    };
    input.click();
  }
  if (
    ds.deleteDictionary &&
    !loading &&
    confirm("이 사전만 삭제할까요? 초안·기록·라이브러리는 유지됩니다.")
  ) {
    try {
      await removeDictionary(ds.deleteDictionary);
      dictionaries = await listDictionaries();
      if (data.settings.dictionaryId === ds.deleteDictionary) {
        data.settings.dictionaryId = null;
        data.settings.filter = "";
        void loadActive();
      }
      renderDictionaries();
      changed();
    } catch {
      notice("사전을 삭제하지 못했습니다.", true);
    }
  }
  if (ds.loadPrompt) {
    const p = data.prompts.find((x) => x.id === ds.loadPrompt);
    if (
      p &&
      (await flush()) &&
      confirm("현재 양쪽 초안을 저장한 프롬프트로 교체할까요?")
    ) {
      data.draft.positive = p.positive;
      data.draft.negative = p.negative;
      data.draft.selection = {
        positive: [p.positive.length, p.positive.length],
        negative: [p.negative.length, p.negative.length],
      };
      undoStack.positive = [];
      undoStack.negative = [];
      syncEditors();
      changed();
      requestInline();
      page("editor");
    }
  }
  if (ds.deletePrompt && confirm("저장한 프롬프트를 삭제할까요?")) {
    data.prompts = data.prompts.filter((x) => x.id !== ds.deletePrompt);
    renderLibrary();
    changed();
  }
  if (ds.insertGroup) {
    const group = data.tagGroups.find((x) => x.id === ds.insertGroup);
    if (group) {
      insert(group.tags);
      page("editor");
    }
  }
  if (ds.deleteGroup && confirm("이 태그 묶음을 삭제할까요?")) {
    data.tagGroups = data.tagGroups.filter((x) => x.id !== ds.deleteGroup);
    renderLibrary();
    changed();
  }
});
for (const side of ["positive", "negative"] as const) {
  const box = $<HTMLTextAreaElement>(side);
  const remember = () => {
    if (document.activeElement !== box) return false;
    const previous = data.draft.selection[side];
    const moved =
      data.draft.target !== side ||
      previous[0] !== box.selectionStart ||
      previous[1] !== box.selectionEnd;
    data.draft.target = side;
    data.draft.selection[side] = [box.selectionStart, box.selectionEnd];
    if (moved) {
      renderTarget();
      changed();
      requestInline();
    }
    return moved;
  };
  box.addEventListener("input", () => {
    undoStack[side] = [];
    data.draft[side] = box.value;
    remember();
    renderTarget();
    requestInline();
    changed();
  });
  for (const event of ["focus", "click", "keyup", "select"])
    box.addEventListener(event, () => {
      remember();
    });
  box.addEventListener("selectionchange", remember);
  box.addEventListener("compositionstart", () => {
    inlineComposing = true;
    clearTimeout(inlineTimer);
    latestInline = ++seq;
    inlineRows = [];
    renderInline();
  });
  box.addEventListener("compositionend", () => {
    inlineComposing = false;
    remember();
    requestInline();
  });
  box.addEventListener("blur", () => {
    remember();
    void flush();
  });
}
document.addEventListener("pointerdown", (event) => {
  if (
    (event.target as HTMLElement).closest("[data-complete]") &&
    !inlineComposing
  )
    event.preventDefault();
});
document.querySelectorAll<HTMLElement>('[role="tablist"]').forEach((group) =>
  group.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [...group.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const index = tabs.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
            tabs.length;
    tabs[next].focus();
    tabs[next].click();
  }),
);
const query = $<HTMLInputElement>("query");
query.addEventListener("compositionstart", () => {
  composing = true;
  clearTimeout(searchTimer);
  latest = ++seq;
});
query.addEventListener("compositionend", () => {
  composing = false;
  requestSearch();
});
query.addEventListener("input", requestSearch);
$("type-filter").addEventListener("change", () => {
  data.settings.filter = $<HTMLSelectElement>("type-filter").value;
  changed();
  requestSearch();
});
$("search-tab").onclick = () => {
  data.settings.tab = "search";
  renderTabs();
  changed();
};
$("bookmark-tab").onclick = () => {
  data.settings.tab = "bookmarks";
  renderTabs();
  changed();
};
$("history-tab").onclick = () => {
  data.settings.tab = "history";
  renderTabs();
  changed();
};
$("clear-history").onclick = () => {
  if (confirm("사용 기록만 모두 삭제할까요?")) {
    data.history = [];
    renderResults();
    changed();
  }
};
$("save-prompt").onclick = $("library-save").onclick = () => askName("prompt");
$("new-group").onclick = () => askName("group");
$<HTMLDialogElement>("name-dialog").addEventListener("close", () => {
  if ($<HTMLDialogElement>("name-dialog").returnValue !== "save") return;
  const name = $<HTMLInputElement>("item-name").value.trim();
  if (!name) return;
  const now = new Date().toISOString();
  if (nameAction === "prompt")
    data.prompts.unshift({
      id: crypto.randomUUID(),
      name,
      positive: data.draft.positive,
      negative: data.draft.negative,
      createdAt: now,
      updatedAt: now,
    });
  else {
    const tags = [...usedTags(data.draft[data.draft.target])];
    if (!tags.length) {
      notice("먼저 현재 편집기에 태그를 입력하세요.");
      return;
    }
    data.tagGroups.push({ id: crypto.randomUUID(), name, tags });
  }
  changed();
  renderLibrary();
  notice("라이브러리에 저장했습니다.");
});
$<HTMLInputElement>("csv-file").onchange = (event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.[0]) importFile(input.files[0]);
  input.value = "";
};
$("load-sample").onclick = () =>
  importFile(new File([sampleCSV], "tags.example.csv", { type: "text/csv" }));
$("cancel-import").onclick = () => {
  worker.terminate();
  importId = ++seq;
  loading = false;
  startWorker();
  void loadActive();
  setImportDisabled(false);
  $("cancel-import").hidden = true;
  $("import-status").textContent = "취소했습니다. 기존 사전을 유지합니다.";
};
$("export-backup").onclick = exportBackup;
$<HTMLInputElement>("backup-file").onchange = async (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    pendingRestore = validateBackup(
      JSON.parse(await file.text()),
      dictionaries,
    );
    notice("백업 검증 완료. 교체 범위를 확인한 뒤 복원하세요.");
    $("restore-preview").hidden = false;
    $("restore-summary").textContent =
      `검증 완료: 프롬프트 ${pendingRestore.prompts.length}개, 즐겨찾기 ${pendingRestore.favorites.length}개, 기록 ${pendingRestore.history.length}개. CSV는 유지됩니다. 교체 전 ‘백업 내보내기’를 권장합니다.`;
  } catch {
    pendingRestore = null;
    $("restore-preview").hidden = true;
    notice(
      "백업 검증 실패: 앱 ID·버전·데이터 형식을 확인하세요. 기존 데이터는 보존했습니다.",
      true,
    );
  }
};
$("cancel-restore").onclick = () => {
  pendingRestore = null;
  $("restore-preview").hidden = true;
};
$("confirm-restore").onclick = async () => {
  if (!pendingRestore || loading) return;
  const next = pendingRestore;
  if (!(await flush())) return;
  try {
    await saveApp(next);
    data = next;
    undoStack.positive = [];
    undoStack.negative = [];
    revision++;
    savedRevision = revision;
    pendingRestore = null;
    $("restore-preview").hidden = true;
    syncEditors();
    renderDictionaries();
    renderTabs();
    renderLibrary();
    void loadActive();
    status("✓ 복원 데이터 저장됨");
    notice(
      data.settings.dictionaryId
        ? "개인 데이터를 복원했습니다."
        : "복원했습니다. 사용할 CSV를 다시 가져오거나 선택하세요.",
    );
  } catch {
    notice("복원 저장 실패: 기존 데이터를 유지합니다.", true);
  }
};
$("persist-storage").onclick = async () => {
  try {
    notice(
      (await navigator.storage.persist())
        ? "지속 저장이 허용되었습니다."
        : "브라우저가 지속 저장을 허용하지 않았습니다. JSON 백업을 보관하세요.",
    );
    void storageInfo();
  } catch {
    notice("이 환경에서는 지속 저장을 요청할 수 없습니다.");
  }
};
document.addEventListener("visibilitychange", () => {
  if (document.hidden) void flush();
});
window.addEventListener("pagehide", () => void flush());
function updateKeyboardLayout() {
  document.body.classList.toggle(
    "keyboard-open",
    !!window.visualViewport &&
      window.visualViewport.height < window.innerHeight * 0.8 &&
      document.activeElement instanceof HTMLTextAreaElement,
  );
}
window.visualViewport?.addEventListener("resize", updateKeyboardLayout);
document.addEventListener("focusin", updateKeyboardLayout);
document.addEventListener("focusout", updateKeyboardLayout);
let installEvent: any = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installEvent = e;
  $("install-app").hidden = false;
});
$("install-app").onclick = async () => {
  if (installEvent) {
    await installEvent.prompt();
    installEvent = null;
    $("install-app").hidden = true;
  }
};
$("apply-update").onclick = async () => {
  if (waitingSW && (await flush())) waitingSW.postMessage({ kind: "ACTIVATE" });
};
async function setupPWA() {
  if (!("serviceWorker" in navigator)) {
    $("offline-status").textContent =
      "이 환경은 오프라인 설치를 지원하지 않습니다.";
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register("./sw.js", {
      scope: "./",
    });
    const update = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingSW = registration.waiting;
        $("update-bar").hidden = false;
      }
    };
    update();
    registration.addEventListener("updatefound", () =>
      registration.installing?.addEventListener("statechange", update),
    );
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (waitingSW && !reloading) {
        reloading = true;
        location.reload();
      }
    });
    await navigator.serviceWorker.ready;
    $("offline-status").textContent =
      "앱 리소스 준비 완료 · 오프라인으로 다시 열 수 있습니다.";
  } catch {
    $("offline-status").textContent =
      "오프라인 준비 실패. 온라인 상태에서 다시 열어 주세요.";
  }
}
async function boot() {
  try {
    const saved = await loadApp();
    if (saved) data = saved;
    dictionaries = await listDictionaries();
    if (!dictionaries.some((x) => x.id === data.settings.dictionaryId))
      data.settings.dictionaryId = null;
    readyToSave = true;
    syncEditors();
    renderDictionaries();
    renderTabs();
    startWorker();
    void loadActive();
    status("✓ 이 기기에 저장됨");
    void setupPWA();
  } catch {
    status("저장소 연결 실패");
    notice(
      "브라우저 저장소에 접근할 수 없습니다. 편집·복사는 가능하지만 재실행 시 보존되지 않을 수 있습니다.",
      true,
    );
    syncEditors();
    startWorker();
  }
}
void boot();
