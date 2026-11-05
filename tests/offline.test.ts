import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { serviceWorkerSource } from "../scripts/service-worker.mjs";

test("offline shell and worker assets stay within app scope; updates wait for user action", async () => {
  const handlers: Record<string, (event: any) => void> = {},
    deleted: string[] = [],
    cached: string[] = [];
  let activated = false,
    claimed = false,
    fetches = 0;
  const cache = {
    addAll: async (assets: string[]) => {
      cached.push(...assets);
    },
    match: async (request: any) => {
      const url = typeof request === "string" ? request : request.url;
      return url.endsWith("index.html")
        ? "offline shell"
        : url.endsWith("assets/worker.js")
          ? "offline worker"
          : undefined;
    },
  };
  runInNewContext(
    serviceWorkerSource(["./index.html", "./assets/worker.js"], "new"),
    {
      URL,
      self: {
        registration: { scope: "https://example.test/gta/" },
        location: { origin: "https://example.test" },
        addEventListener: (type: string, handler: any) =>
          (handlers[type] = handler),
        clients: {
          claim: async () => {
            claimed = true;
          },
        },
        skipWaiting: () => {
          activated = true;
        },
      },
      caches: {
        open: async () => cache,
        keys: async () => [
          "gta:/gta/:old",
          "gta:/gta/:new",
          "gta:/other/:old",
          "unrelated",
        ],
        delete: async (key: string) => {
          deleted.push(key);
        },
      },
      fetch: () => {
        fetches++;
        throw Error("offline");
      },
    },
  );
  let pending: Promise<unknown> = Promise.resolve();
  handlers.install({ waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
  assert.deepEqual(cached, ["./index.html", "./assets/worker.js"]);
  assert.equal(activated, false);
  handlers.activate({ waitUntil: (p: Promise<unknown>) => (pending = p) });
  await pending;
  assert.deepEqual(deleted, ["gta:/gta/:old"]);
  assert.equal(claimed, true);
  const response = async (request: any) => {
    let result: Promise<unknown> | undefined;
    handlers.fetch({
      request,
      respondWith: (p: Promise<unknown>) => (result = p),
    });
    return result ? await result : undefined;
  };
  assert.equal(
    await response({
      method: "GET",
      url: "https://example.test/gta/",
      mode: "navigate",
    }),
    "offline shell",
  );
  assert.equal(
    await response({
      method: "GET",
      url: "https://example.test/gta/assets/worker.js",
      mode: "cors",
    }),
    "offline worker",
  );
  assert.equal(
    await response({ method: "POST", url: "https://example.test/gta/" }),
    undefined,
  );
  assert.equal(
    await response({ method: "GET", url: "https://other.test/gta/" }),
    undefined,
  );
  assert.equal(
    await response({ method: "GET", url: "https://example.test/other/" }),
    undefined,
  );
  assert.equal(fetches, 0);
  handlers.message({ data: { kind: "ACTIVATE" } });
  assert.equal(activated, true);
});
