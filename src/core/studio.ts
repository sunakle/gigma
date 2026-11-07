import { rememberDraft, forgetDraft } from "./browser-drafts";
import {
  validateDocument,
  type DesignDocument,
  type DesignPage,
} from "../../shared/model";
import { storage } from "./storage";
import { coverFor } from "./svg";
import { refreshGroups } from "./geometry";
type Entry = {
  before: DesignDocument;
  after: DesignDocument;
  bytes: number;
  label: string;
};
export class Studio {
  document: DesignDocument | null = null;
  selection: string[] = [];
  version = 0;
  generation = 0;
  savedGeneration = 0;
  diskRevision = 0;
  status = "Все изменения сохранены";
  listeners = new Set<() => void>();
  undoStack: Entry[] = [];
  redoStack: Entry[] = [];
  before: DesignDocument | null = null;
  label = "";
  historyBytes = 0;
  timer: ReturnType<typeof setTimeout> | undefined;
  saveQueue = Promise.resolve();
  error = "";
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  snapshot = () => this.version;
  emit = () => {
    this.version++;
    this.listeners.forEach((fn) => fn());
  };
  get page(): DesignPage | null {
    return (
      this.document?.pages.find((p) => p.id === this.document?.activePageId) ??
      null
    );
  }
  select(ids: string[]) {
    this.selection = ids;
    this.emit();
  }
  begin(label: string) {
    if (!this.document) return;
    if (this.before) this.finish();
    this.before = structuredClone(this.document);
    this.before.cover = "";
    this.label = label;
  }
  finish() {
    if (!this.document || !this.before) return;
    refreshGroups(this.page!.nodes);
    const after = structuredClone(this.document);
    after.cover = "";
    const before = this.before;
    this.before = null;
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const bytes =
        (JSON.stringify(before).length + JSON.stringify(after).length) * 2;
      this.undoStack.push({ before, after, bytes, label: this.label });
      this.redoStack = [];
      this.historyBytes += bytes;
      while (
        this.historyBytes > 64 * 1024 * 1024 ||
        this.undoStack.length > 128
      ) {
        this.historyBytes -= this.undoStack.shift()!.bytes;
      }
      this.changed();
    }
    this.emit();
  }
  mutate(label: string, fn: (doc: DesignDocument, page: DesignPage) => void) {
    if (!this.document || !this.page) return;
    this.begin(label);
    try {
      fn(this.document, this.page);
      validateDocument(this.document);
      this.finish();
    } catch (e) {
      if (this.before) this.document = this.before;
      this.before = null;
      this.emit();
      throw e;
    }
  }
  changed() {
    this.generation++;
    if (this.document) rememberDraft(this.document, this.diskRevision);
    this.status = "Есть изменения";
    this.error = "";
    this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.before) {
        this.schedule();
        return;
      }
      void this.save().catch(() => {});
    }, 500);
  }
  view(fn: (page: DesignPage) => void) {
    if (this.page) {
      fn(this.page);
      this.changed();
      this.emit();
    }
  }
  undo() {
    if (this.before) this.finish();
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.historyBytes -= entry.bytes;
    this.redoStack.push(entry);
    this.restore(entry.before);
  }
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(entry);
    this.historyBytes += entry.bytes;
    this.restore(entry.after);
  }
  private restore(doc: DesignDocument) {
    const revision = this.diskRevision;
    this.document = { ...structuredClone(doc), revision };
    this.selection = [];
    this.changed();
    this.emit();
  }
  async saveCopy() {
    if (!this.document) return;
    await this.saveQueue;
    const generation = this.generation,
      originalId = this.document.id;
    const copy = structuredClone(this.document);
    copy.id = crypto.randomUUID();
    copy.revision = 0;
    copy.name = copy.name.slice(0, 190) + " — копия";
    copy.createdAt = new Date().toISOString();
    const saved = await storage.save(copy, 0);
    if (this.document?.id !== originalId) return;
    forgetDraft(originalId);
    Object.assign(this.document, {
      id: copy.id,
      name: copy.name,
      createdAt: copy.createdAt,
      ...saved,
    });
    this.diskRevision = saved.revision;
    this.savedGeneration = generation;
    this.undoStack = [];
    this.redoStack = [];
    this.historyBytes = 0;
    this.error = "";
    this.status =
      generation === this.generation
        ? "Все изменения сохранены"
        : "Есть изменения";
    if (generation !== this.generation) {
      rememberDraft(this.document, this.diskRevision);
      this.schedule();
    }
    this.emit();
  }
  async flush() {
    do {
      await this.save();
    } while (this.document && this.generation !== this.savedGeneration);
  }
  async open(doc: DesignDocument) {
    if (this.document) await this.flush();
    clearTimeout(this.timer);
    this.document = validateDocument(doc);
    this.diskRevision = doc.revision;
    this.undoStack = [];
    this.redoStack = [];
    this.historyBytes = 0;
    this.selection = [];
    this.generation = 0;
    this.savedGeneration = 0;
    this.status = "Все изменения сохранены";
    this.error = "";
    this.emit();
  }
  save() {
    clearTimeout(this.timer);
    if (this.before) this.finish();
    clearTimeout(this.timer);
    if (!this.document) return Promise.resolve();
    const snapshot = structuredClone(this.document),
      generation = this.generation;
    if (generation === this.savedGeneration && snapshot.revision > 0)
      return this.saveQueue;
    this.status = "Сохраняю на компьютер…";
    this.emit();
    const job = this.saveQueue.then(async () => {
      try {
        const page = snapshot.pages.find(
          (p) => p.id === snapshot.activePageId,
        )!;
        snapshot.cover = await coverFor(page);
        const result = await storage.save(snapshot, this.diskRevision);
        if (this.document?.id === snapshot.id) {
          this.diskRevision = result.revision;
          this.document.revision = result.revision;
          this.document.updatedAt = result.updatedAt;
          this.document.cover = snapshot.cover;
          this.savedGeneration = generation;
          if (generation === this.generation) forgetDraft(snapshot.id);
          else rememberDraft(this.document, this.diskRevision);
          this.status =
            generation === this.generation
              ? "Все изменения сохранены"
              : "Есть изменения";
          this.error = "";
          this.emit();
        }
      } catch (e) {
        this.error =
          e instanceof Error ? e.message : "Не удалось сохранить документ.";
        this.status = "Ошибка сохранения";
        this.emit();
        throw e;
      }
    });
    this.saveQueue = job.catch(() => {});
    return job;
  }
}
export const studio = new Studio();
