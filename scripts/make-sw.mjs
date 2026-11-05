import { serviceWorkerSource } from "./service-worker.mjs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const walk = async (dir) =>
  (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map(async (e) =>
        e.isDirectory() ? walk(`${dir}/${e.name}`) : `${dir}/${e.name}`,
      ),
    )
  ).flat();
const files = (await walk("dist")).filter((x) => !x.endsWith("/sw.js")).sort();
const hash = createHash("sha256");
for (const f of files) hash.update(await readFile(f));
const assets = files.map((x) => "./" + x.slice(5));
await writeFile(
  "dist/sw.js",
  serviceWorkerSource(assets, hash.digest("hex").slice(0, 16)),
);
