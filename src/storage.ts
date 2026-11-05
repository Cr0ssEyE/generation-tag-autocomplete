import type { AppData, Dictionary, Row } from "./model.ts";
const DB_NAME = "generation-tag-autocomplete-v1";
let database: Promise<IDBDatabase> | undefined;
let appVersion: string | null = null;
export class StorageConflictError extends Error {}
export async function loadApp(): Promise<AppData | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("app");
    const current = tx.objectStore("app").get("current");
    const token = tx.objectStore("app").get("version");
    tx.oncomplete = () => {
      appVersion = token.result ?? null;
      resolve(current.result);
    };
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export function openDB() {
  return (database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      for (const name of ["app", "dictionaries", "rows"])
        req.result.createObjectStore(name);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    req.onerror = () => {
      database = undefined;
      reject(req.error);
    };
    req.onblocked = () => {
      database = undefined;
      reject(new Error("다른 앱 탭을 닫고 다시 시도하세요."));
    };
  }));
}
export async function get<T>(
  store: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store);
    let value: T | undefined;
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => (value = req.result);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function listDictionaries(): Promise<Dictionary[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("dictionaries");
    const req = tx.objectStore("dictionaries").getAll();
    tx.oncomplete = () => resolve(req.result);
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function saveApp(data: AppData) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("app", "readwrite");
    const store = tx.objectStore("app");
    const version = crypto.randomUUID();
    let conflict = false;
    const request = store.get("version");
    request.onsuccess = () => {
      if ((request.result ?? null) !== appVersion) {
        conflict = true;
        tx.abort();
        return;
      }
      try {
        store.put(data, "current");
        store.put(version, "version");
      } catch (error) {
        tx.abort();
        reject(error);
      }
    };
    tx.oncomplete = () => {
      appVersion = version;
      resolve();
    };
    tx.onabort = tx.onerror = () =>
      reject(
        conflict
          ? new StorageConflictError(
              "다른 탭에서 저장한 데이터가 있습니다. 현재 내용을 백업한 뒤 새로고침하세요.",
            )
          : tx.error,
      );
  });
}
export async function putDictionary(meta: Dictionary, rows: Row[]) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["dictionaries", "rows"], "readwrite");
    try {
      tx.objectStore("dictionaries").put(meta, meta.id);
      tx.objectStore("rows").put(rows, meta.id);
    } catch (error) {
      tx.abort();
      reject(error);
    }
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
export async function removeDictionary(id: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["dictionaries", "rows"], "readwrite");
    tx.objectStore("dictionaries").delete(id);
    tx.objectStore("rows").delete(id);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
