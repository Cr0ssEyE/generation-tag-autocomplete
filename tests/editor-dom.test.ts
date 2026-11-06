import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import {
  freshData,
  indexRows,
  search,
  browse,
  type AppData,
} from "../src/model.ts";
import { parseCSV } from "../src/csv.ts";
import { get, loadApp, saveApp, putDictionary } from "../src/storage.ts";

// This is a simulated DOM integration test, not proof of native Android IME/layout.
test("editor DOM integration with synthetic data and composition events", async (t) => {
  const dom = new JSDOM(
    '<!doctype html><html><body><div id="app"></div></body></html>',
    { url: "http://localhost/", pretendToBeVisual: true },
  );
  const w = dom.window;
  for (const key of [
    "window",
    "document",
    "navigator",
    "location",
    "HTMLElement",
    "HTMLTextAreaElement",
    "HTMLDialogElement",
  ]) {
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? w : (w as any)[key],
      configurable: true,
    });
  }
  let clipboard = "",
    rejectCopy = false;
  Object.defineProperty(w.navigator, "clipboard", {
    value: {
      writeText: async (text: string) => {
        if (rejectCopy) throw new Error("denied");
        clipboard = text;
      },
    },
  });
  const viewport = Object.assign(new w.EventTarget(), {
    offsetTop: 0,
    offsetLeft: 0,
    width: 390,
    height: 844,
  });
  Object.defineProperty(w, "visualViewport", { value: viewport });
  w.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
    this.querySelector<HTMLElement>("[autofocus]")?.focus();
  };
  w.HTMLDialogElement.prototype.close = function (result = "") {
    this.returnValue = result;
    this.removeAttribute("open");
    this.dispatchEvent(new w.Event("close"));
  };
  w.HTMLElement.prototype.getBoundingClientRect = function () {
    return {
      top: 0,
      left: 0,
      right: 390,
      bottom: this.classList.contains("main-nav") ? 56 : 0,
      width: 390,
      height: this.classList.contains("main-nav") ? 56 : 0,
      x: 0,
      y: 0,
      toJSON() {},
    };
  };
  const requests: any[] = [];
  class TestWorker {
    onmessage: any;
    onerror: any;
    active = true;
    indexed: any[] = [];
    pending: any;
    constructor(..._args: any[]) {}
    terminate() {
      this.active = false;
    }
    send(message: any) {
      if (this.active) this.onmessage?.({ data: message });
    }
    postMessage(message: any) {
      requests.push(message);
      void this.handle(message).catch((error) => this.onerror?.(error));
    }
    async handle(message: any) {
      const { kind, id } = message;
      if (kind === "load") {
        this.indexed = indexRows(
          message.dictionaryId
            ? ((await get<any[]>("rows", message.dictionaryId)) ?? [])
            : [],
        );
        this.send({ kind: "loaded", id });
      }
      if (kind === "import") {
        const { rows, report } = parseCSV(await message.file.text());
        const meta = {
          id: "synthetic-sample",
          name: "tags.example.csv",
          filename: "tags.example.csv",
          fingerprint: "a".repeat(64),
          categories: [...new Set(rows.map((row) => row.category))],
          count: rows.length,
          updatedAt: new Date().toISOString(),
        };
        this.pending = { rows, meta, report };
        this.send({ kind: "ready", id, meta, report });
      }
      if (kind === "commit") {
        const p = this.pending;
        await putDictionary(p.meta, p.rows);
        this.indexed = indexRows(p.rows);
        this.send({ kind: "imported", id, ...p });
      }
      if (kind === "search") {
        await new Promise((resolve) => setTimeout(resolve, 10));
        this.send({
          kind: "results",
          id,
          rows: search(this.indexed, message.query, message.filter),
        });
      }
      if (kind === "browse")
        this.send({
          kind: "browse-results",
          id,
          rows: message.query.trim()
            ? search(this.indexed, message.query, message.filter)
            : browse(this.indexed, message.filter),
        });
    }
  }
  Object.defineProperty(globalThis, "Worker", {
    value: TestWorker,
    configurable: true,
  });
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier.endsWith(".css"))
        return {
          url: "data:text/javascript,export%20default%20%22%22",
          shortCircuit: true,
        };
      if (specifier.endsWith("tags.example.csv?raw")) {
        const url = new URL(specifier, context.parentURL);
        url.search = "";
        return {
          url:
            "data:text/javascript," +
            encodeURIComponent(
              "export default " + JSON.stringify(readFileSync(url, "utf8")),
            ),
          shortCircuit: true,
        };
      }
      return nextResolve(specifier, context);
    },
  });
  t.after(() => {
    hook.deregister();
    w.close();
  });
  await loadApp();
  const initial = freshData();
  initial.prompts = [
    {
      id: "synthetic-preview",
      name: "합성 미리보기",
      positive: "sunlight",
      negative: "",
      createdAt: "2026-11-06T00:00:00Z",
      updatedAt: "2026-11-06T00:00:00Z",
    },
  ];
  await saveApp(initial);
  await import("../src/main.ts");
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    w.document.getElementById(id) as unknown as T;
  const click = (selector: string) => {
    const el = w.document.querySelector<HTMLElement>(selector);
    assert.ok(el, selector);
    el.dispatchEvent(
      new w.MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
  };
  const until = async (check: () => boolean, label: string) => {
    for (let i = 0; i < 200; i++) {
      if (check()) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("Timed out: " + label);
  };
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  const input = (id: string, text: string, composing = false) => {
    const el = $<HTMLTextAreaElement>(id);
    el.focus();
    el.value = text;
    el.setSelectionRange(text.length, text.length);
    el.dispatchEvent(
      new w.InputEvent("input", {
        bubbles: true,
        inputType: composing ? "insertCompositionText" : "insertText",
        isComposing: composing,
      }),
    );
    return el;
  };
  const candidate = (tag: string) =>
    w.document.querySelector<HTMLButtonElement>(`[data-complete="${tag}"]`);
  const pointer = (el: HTMLElement, type = "pointerdown") =>
    el.dispatchEvent(
      new w.MouseEvent(type, { bubbles: true, cancelable: true }),
    );
  const saved = async () => {
    await pause(360);
    return (await get<AppData>("app", "current"))!;
  };
  await until(() => $("save-status").textContent!.includes("저장됨"), "boot");
  click('[data-page="dictionary"]');
  click("#load-sample");
  await until(
    () => $("import-status").textContent!.includes("완료"),
    "sample import",
  );
  click('[data-page="editor"]');

  await t.test(
    "composition remains live while candidates are shown; selected tag applies once",
    async () => {
      const box = input("positive", "");
      box.dispatchEvent(
        new w.CompositionEvent("compositionstart", { bubbles: true }),
      );
      input("positive", "여자1명", true);
      await until(
        () => !!candidate("1girl") && !candidate("1girl")!.disabled,
        "composing candidate",
      );
      assert.equal(box.value, "여자1명");
      const button = candidate("1girl")!;
      pointer(button);
      box.setSelectionRange(3, 4);
      box.dispatchEvent(
        new w.CompositionEvent("compositionend", {
          bubbles: true,
          data: "여자1명",
        }),
      );
      box.setSelectionRange(4, 4);
      box.dispatchEvent(
        new w.InputEvent("input", { bubbles: true, isComposing: false }),
      );
      button.click();
      await until(() => box.value === "1girl", "composition replacement");
      const data = await saved();
      assert.equal(data.history.find((row) => row.tag === "1girl")?.uses, 1);
      assert.equal(data.draft.positive, "1girl");
    },
  );

  await t.test(
    "cancelled pointer and changed composition context never replace the text",
    async () => {
      const box = input("positive", "blue e");
      box.dispatchEvent(
        new w.CompositionEvent("compositionstart", { bubbles: true }),
      );
      await until(
        () => !!candidate("blue eyes") && !candidate("blue eyes")!.disabled,
        "blue candidate",
      );
      pointer(candidate("blue eyes")!);
      pointer(candidate("blue eyes")!, "pointercancel");
      box.dispatchEvent(
        new w.CompositionEvent("compositionend", { bubbles: true }),
      );
      await pause(70);
      assert.equal(box.value, "blue e");
      box.dispatchEvent(
        new w.CompositionEvent("compositionstart", { bubbles: true }),
      );
      const button = candidate("blue eyes")!;
      pointer(button);
      box.dispatchEvent(
        new w.CompositionEvent("compositionend", { bubbles: true }),
      );
      input("positive", "manual change");
      button.click();
      await pause(80);
      assert.equal(box.value, "manual change");
    },
  );

  await t.test(
    "finder preserves the editor caret while its search field is focused and supports continuous insertion",
    async () => {
      const box = input("positive", "1girl");
      box.setSelectionRange(0, 0);
      box.dispatchEvent(new w.Event("select"));
      const before = w.document.activeElement;
      pointer($("finder-toggle"));
      click("#finder-toggle");
      assert.equal(w.document.activeElement, before);
      assert.equal($("finder-toggle").getAttribute("aria-expanded"), "true");
      click("#search-tab");
      $<HTMLSelectElement>("type-filter").value = "0";
      $("type-filter").dispatchEvent(new w.Event("change"));
      await until(
        () => !!w.document.querySelector('[data-insert="blue eyes"]'),
        "type candidates",
      );
      $("query").focus();
      for (const tag of ["blue eyes", "sunlight"]) {
        const button = w.document.querySelector<HTMLElement>(
          `#results [data-insert="${tag}"]`,
        )!;
        assert.equal(pointer(button), false, "pointer focus is preserved");
        button.click();
      }
      assert.equal(box.value, "blue eyes, sunlight, 1girl");
      assert.equal(w.document.activeElement, $("query"));
      assert.equal($("finder-panel").hidden, false);
      $("results").scrollTop = 123;
      click("#finder-close");
      click("#finder-toggle");
      assert.equal($("results").scrollTop, 123);
      viewport.height = 320;
      viewport.dispatchEvent(new w.Event("resize"));
      assert.equal($("finder-panel").classList.contains("compact"), true);
      assert.equal(
        w.document.documentElement.style.getPropertyValue("--surface-height"),
        "264px",
      );
      viewport.height = 844;
      viewport.dispatchEvent(new w.Event("resize"));
      click('[data-page="library"]');
      assert.equal($("finder-panel").hidden, true);
      click('[data-page="editor"]');
      assert.equal($("finder-panel").hidden, true);
      $("finder-toggle").click();
      assert.equal(
        w.document.activeElement,
        $("finder-close"),
        "keyboard activation enters the panel controls",
      );
      w.document.dispatchEvent(
        new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      assert.equal(w.document.activeElement, $("finder-toggle"));
      assert.equal($("finder-panel").hidden, true);
    },
  );

  await t.test(
    "finder insertion also waits for a live composition to end",
    async () => {
      const box = input("positive", "여자1명");
      box.dispatchEvent(
        new w.CompositionEvent("compositionstart", { bubbles: true }),
      );
      click("#finder-toggle");
      const button = w.document.querySelector<HTMLElement>(
        '#results [data-insert="sunlight"]',
      )!;
      assert.ok(button);
      pointer(button);
      box.dispatchEvent(
        new w.CompositionEvent("compositionend", { bubbles: true }),
      );
      box.dispatchEvent(new w.InputEvent("input", { bubbles: true }));
      button.click();
      await pause(100);
      assert.equal(
        box.value,
        "여자1명, sunlight",
        $("notice").textContent ?? "finder composition insertion",
      );
      assert.equal($("finder-panel").hidden, false);
      click("#finder-close");
    },
  );

  await t.test(
    "preview copy and cancel do not mutate drafts; confirmed load clears an empty negative",
    async () => {
      input("positive", "current positive");
      click('[data-target="negative"]');
      input("negative", "current negative");
      const before = await saved();
      click('[data-page="library"]');
      click('[data-load-prompt="synthetic-preview"]');
      assert.equal($("prompt-preview").hasAttribute("open"), true);
      assert.equal(
        $<HTMLTextAreaElement>("preview-positive").value,
        "sunlight",
      );
      assert.equal(
        w.document.querySelector<HTMLButtonElement>(
          '[data-preview-copy="negative"]',
        )!.disabled,
        true,
      );
      click('[data-preview-copy="positive"]');
      await pause(10);
      assert.equal(clipboard, "sunlight");
      rejectCopy = true;
      click('[data-preview-copy="positive"]');
      await pause(10);
      assert.equal(
        $<HTMLTextAreaElement>("preview-positive").selectionEnd,
        "sunlight".length,
      );
      assert.ok($("preview-status").textContent!.includes("수동"));
      rejectCopy = false;
      click("#preview-cancel");
      assert.equal(
        $<HTMLTextAreaElement>("negative").value,
        "current negative",
      );
      assert.deepEqual(
        (await get<AppData>("app", "current"))!.draft,
        before.draft,
      );
      click('[data-load-prompt="synthetic-preview"]');
      click("#preview-load");
      await until(
        () => !$("prompt-preview").hasAttribute("open"),
        "confirmed load",
      );
      assert.equal($<HTMLTextAreaElement>("positive").value, "sunlight");
      assert.equal($<HTMLTextAreaElement>("negative").value, "");
      assert.equal(
        (await get<AppData>("app", "current"))!.draft.target,
        "negative",
      );
    },
  );

  await t.test(
    "quota failure and stale-tab conflict preserve both existing drafts and show a failure",
    async () => {
      input("negative", "preserve on failure");
      await saved();
      click('[data-page="library"]');
      click('[data-load-prompt="synthetic-preview"]');
      const before = await get<AppData>("app", "current");
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, key) {
        if (this.name === "app" && key === "current")
          throw new DOMException(
            "Synthetic quota failure",
            "QuotaExceededError",
          );
        return original.call(this, value, key);
      };
      try {
        click("#preview-load");
        await until(
          () => $("preview-status").classList.contains("error"),
          "quota rejection",
        );
        assert.deepEqual(await get("app", "current"), before);
        assert.equal(
          $<HTMLTextAreaElement>("negative").value,
          "preserve on failure",
        );
      } finally {
        IDBObjectStore.prototype.put = original;
      }
      click("#preview-cancel");
      const other = await import("../src/storage.ts?dom-stale-tab");
      const newer = (await other.loadApp())!;
      newer.draft.negative = "newer tab draft";
      await other.saveApp(newer);
      click('[data-load-prompt="synthetic-preview"]');
      click("#preview-load");
      await until(
        () => $("preview-status").textContent!.includes("다른 탭"),
        "stale-tab rejection",
      );
      assert.equal(
        $<HTMLTextAreaElement>("negative").value,
        "preserve on failure",
      );
      assert.equal(
        (await get<AppData>("app", "current"))!.draft.negative,
        "newer tab draft",
      );
      assert.equal($("prompt-preview").hasAttribute("open"), true);
    },
  );
  assert.ok(
    requests.some(
      (request) => request.kind === "search" && request.query === "여자1명",
    ),
  );
});
