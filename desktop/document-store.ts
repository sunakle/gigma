import {
  mkdir,
  readFile,
  rename,
  copyFile,
  readdir,
  stat,
  open,
  rm,
} from "node:fs/promises";
import { join } from "node:path";
import { lock } from "proper-lockfile";
import {
  validateDocument,
  summary,
  type DesignDocument,
  type Summary,
} from "../shared/model";
const MAX_BYTES = 32 * 1024 * 1024;
export class DocumentStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public folder: string) {}
  private path(id: string) {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
      throw new Error("Некорректный идентификатор документа.");
    return join(this.folder, id + ".gigma");
  }
  private async read(path: string) {
    const s = await stat(path);
    if (s.size > MAX_BYTES) throw new Error("Документ больше 32 МиБ.");
    return validateDocument(JSON.parse(await readFile(path, "utf8")));
  }
  async load(id: string) {
    const path = this.path(id);
    try {
      return { document: await this.read(path), recovered: false };
    } catch (error) {
      try {
        return { document: await this.read(path + ".bak"), recovered: true };
      } catch {
        throw new Error(
          "Не удалось открыть документ. Проверьте файл или восстановите резервную копию.",
        );
      }
    }
  }
  async list() {
    await mkdir(this.folder, { recursive: true });
    const files = await readdir(this.folder),
      ids = new Set(
        files
          .filter((f) => /\.gigma(\.bak)?$/.test(f))
          .map((f) => f.replace(/\.gigma(\.bak)?$/, "")),
      );
    const all: Summary[] = [];
    for (const id of ids) {
      try {
        all.push(summary((await this.load(id)).document));
      } catch {}
    }
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  save(input: unknown, expectedRevision: number) {
    const job = this.queue.then(async () => {
      const bytes = JSON.stringify(input);
      if (Buffer.byteLength(bytes) > MAX_BYTES)
        throw new Error(
          "Документ больше 32 МиБ. Уменьшите изображения или разделите страницы.",
        );
      const doc = validateDocument(JSON.parse(bytes));
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
        throw new Error("Неверная версия записи.");
      await mkdir(this.folder, { recursive: true });
      const path = this.path(doc.id);
      const unlock = await lock(path, {
        realpath: false,
        retries: { retries: 8, minTimeout: 25, maxTimeout: 300 },
        stale: 10000,
      });
      try {
        let old: Awaited<ReturnType<DocumentStore["load"]>> | null = null;
        const exists = async (name: string) => {
          try {
            await stat(name);
            return true;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
            throw e;
          }
        };
        if ((await exists(path)) || (await exists(path + ".bak")))
          old = await this.load(doc.id);
        if ((old?.document.revision ?? 0) !== expectedRevision)
          throw new Error(
            "Этот документ изменён в другом окне. Сохраните свою работу как копию, чтобы сохранить обе версии.",
          );
        doc.revision = expectedRevision + 1;
        doc.updatedAt = new Date().toISOString();
        const temp = path + "." + crypto.randomUUID() + ".tmp";
        try {
          const file = await open(temp, "wx");
          try {
            await file.writeFile(JSON.stringify(doc));
            await file.sync();
          } finally {
            await file.close();
          }
          if (old && !old.recovered) {
            await copyFile(path, temp + ".bak");
            await rename(temp + ".bak", path + ".bak");
          }
          await rename(temp, path);
          return { revision: doc.revision, updatedAt: doc.updatedAt };
        } finally {
          await rm(temp, { force: true });
          await rm(temp + ".bak", { force: true });
        }
      } finally {
        await unlock();
      }
    });
    this.queue = job.catch(() => {});
    return job;
  }
  idle() {
    return this.queue;
  }
}
