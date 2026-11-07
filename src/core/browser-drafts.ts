import { uid, validateDocument, type DesignDocument } from "../../shared/model";
import { storage } from "./storage";

// A tab may close before an HTTP save is acknowledged. Keep its latest completed
// edit locally and replay it on the next launch. Web Locks skip drafts in live tabs.
const prefix = "gigma.pending.v1.";
const tab = uid();
const key = prefix + tab;
const enabled = !window.gigma && typeof navigator.locks !== "undefined";
const ready = enabled
  ? new Promise<void>((resolve, reject) => {
      navigator.locks
        .request(key, async () => {
          resolve();
          await new Promise<void>(() => {});
        })
        .catch(reject);
    })
  : Promise.resolve();
let current: string | null = null;
export function rememberDraft(document: DesignDocument, revision: number) {
  if (!enabled) return false;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ revision, document: { ...document, cover: "" } }),
    );
    current = document.id;
    return true;
  } catch {
    return false;
  }
}
export function forgetDraft(id: string) {
  if (current !== id) return;
  try {
    localStorage.removeItem(key);
    current = null;
  } catch {
    /* The file already exists on disk. */
  }
}
function content(d: DesignDocument) {
  return JSON.stringify({ ...d, cover: "", revision: 0, updatedAt: "" });
}
let restoring: Promise<void> | null = null;
export function recoverDrafts() {
  if (!enabled) return Promise.resolve();
  return (restoring ??= restore().finally(() => {
    restoring = null;
  }));
}
async function restore() {
  await ready;
  const keys = Object.keys(localStorage).filter(
    (k) => k.startsWith(prefix) && k !== key,
  );
  for (const k of keys)
    await navigator.locks.request(k, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      const raw = localStorage.getItem(k);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const d = validateDocument(parsed.document);
      if (!Number.isSafeInteger(parsed.revision) || parsed.revision < 0)
        throw new Error("Не удалось проверить локальный черновик.");
      const known = (await storage.list()).some((s) => s.id === d.id);
      const disk = known ? (await storage.load(d.id)).document : null;
      if (!disk || content(d) !== content(disk)) {
        if (disk && disk.revision !== parsed.revision) {
          d.id = uid();
          d.name = d.name.slice(0, 179) + " — восстановлено";
          d.revision = 0;
        }
        await storage.save(d, disk?.id === d.id ? disk.revision : 0);
      }
      localStorage.removeItem(k);
    });
}
