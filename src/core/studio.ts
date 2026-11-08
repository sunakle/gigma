import { rememberDraft, forgetDraft } from "./browser-drafts";
import {
  validateDocument,
  type DesignDocument,
  type DesignPage,
} from "../../shared/model";
import { storage } from "./storage";
import { coverFor } from "./svg";
import { descendants, refreshGroups } from "./geometry";
type Snapshot = {
  before: DesignDocument;
  after: DesignDocument;
  bytes: number;
  label: string;
};
type Translation = {
  pageId: string;
  positions: { id: string; x: number; y: number }[];
  dx: number;
  dy: number;
  bytes: number;
  label: string;
};
type Entry = Snapshot | Translation;
export class Studio {
  artworkVersion = 0;
  private coverVersion = -1;
  private coverPage = "";
  private cameraFrame = 0;
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
  emit = (artworkChanged = true) => {
    if (artworkChanged) this.artworkVersion++;
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
    if (
      ids.length === this.selection.length &&
      ids.every((id, i) => id === this.selection[i])
    )
      return;
    this.selection = ids;
    this.emit(false);
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
    const original = JSON.stringify(before),
      current = JSON.stringify(after);
    if (original !== current) {
      this.record({
        before,
        after,
        bytes: (original.length + current.length) * 2,
        label: this.label,
      });
      this.changed();
    }
    this.emit();
  }
  private record(entry: Entry) {
    this.undoStack.push(entry);
    this.redoStack = [];
    this.historyBytes += entry.bytes;
    while (this.historyBytes > 64 * 1024 * 1024 || this.undoStack.length > 128)
      this.historyBytes -= this.undoStack.shift()!.bytes;
  }
  translate(page: DesignPage, ids: string[], dx: number, dy: number) {
    if (page !== this.page || (!dx && !dy)) return;
    if (this.before) this.finish();
    const all = descendants(page.nodes, ids);
    const positions = page.nodes
      .filter((n) => all.has(n.id))
      .map(({ id, x, y }) => ({ id, x, y }));
    if (!positions.length) return;
    const entry = {
      pageId: page.id,
      positions,
      dx,
      dy,
      bytes: 128 + positions.length * 128,
      label: "Переместить",
    };
    this.record(entry);
    this.applyTranslation(entry, true);
  }
  private applyTranslation(entry: Translation, forward: boolean) {
    const page = this.document?.pages.find((p) => p.id === entry.pageId);
    if (!page) return;
    const nodes = new Map(page.nodes.map((n) => [n.id, n]));
    for (const p of entry.positions) {
      const n = nodes.get(p.id);
      if (n) {
        n.x = p.x + (forward ? entry.dx : 0);
        n.y = p.y + (forward ? entry.dy : 0);
      }
    }
    refreshGroups(page.nodes);
    this.changed();
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
  changed(keepDraft = true) {
    this.generation++;
    if (keepDraft && this.document)
      rememberDraft(this.document, this.diskRevision);
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
  // Camera events change a few numbers. Batch UI updates and keep full document
  // serialization out of the input handler. Closing the window still flushes the view.
  camera(fn: (page: DesignPage) => void) {
    if (!this.page) return;
    fn(this.page);
    this.changed(false);
    if (!this.cameraFrame)
      this.cameraFrame = requestAnimationFrame(() => {
        this.cameraFrame = 0;
        this.emit(false);
      });
  }
  undo() {
    if (this.before) this.finish();
    const entry = this.undoStack.pop();
    if (!entry) return;
    this.historyBytes -= entry.bytes;
    this.redoStack.push(entry);
    if ("positions" in entry) this.replayTranslation(entry, false);
    else this.restore(entry.before);
  }
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) return;
    this.undoStack.push(entry);
    this.historyBytes += entry.bytes;
    if ("positions" in entry) this.replayTranslation(entry, true);
    else this.restore(entry.after);
  }
  private replayTranslation(entry: Translation, forward: boolean) {
    if (this.document) this.document.activePageId = entry.pageId;
    this.selection = [];
    this.applyTranslation(entry, forward);
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
    let fontChanged = false;
    for (const page of this.document.pages)
      for (const node of page.nodes)
        if (node.kind === "text" && node.fontFamily !== "Impact") {
          node.fontFamily = "Impact";
          fontChanged = true;
        }
    this.diskRevision = doc.revision;
    this.undoStack = [];
    this.redoStack = [];
    this.historyBytes = 0;
    this.selection = [];
    this.generation = 0;
    this.savedGeneration = 0;
    this.status = "Все изменения сохранены";
    this.error = "";
    if (fontChanged) this.changed();
    this.emit();
    this.coverVersion = !fontChanged && doc.cover ? this.artworkVersion : -1;
    this.coverPage = doc.activePageId;
  }
  save() {
    clearTimeout(this.timer);
    if (this.before) this.finish();
    clearTimeout(this.timer);
    if (!this.document) return Promise.resolve();
    const generation = this.generation;
    if (generation === this.savedGeneration && this.document.revision > 0)
      return this.saveQueue;
    const snapshot = structuredClone(this.document),
      artwork = this.artworkVersion;
    this.status = "Сохраняю на компьютер…";
    this.emit(false);
    const job = this.saveQueue.then(async () => {
      try {
        const page = snapshot.pages.find(
          (p) => p.id === snapshot.activePageId,
        )!;
        if (
          this.coverVersion === artwork &&
          this.coverPage === page.id &&
          this.document?.id === snapshot.id &&
          this.document.cover
        )
          snapshot.cover = this.document.cover;
        else snapshot.cover = await coverFor(page);
        const result = await storage.save(snapshot, this.diskRevision);
        if (this.document?.id === snapshot.id) {
          this.diskRevision = result.revision;
          this.document.revision = result.revision;
          this.document.updatedAt = result.updatedAt;
          this.document.cover = snapshot.cover;
          this.coverVersion = artwork;
          this.coverPage = page.id;
          this.savedGeneration = generation;
          if (generation === this.generation) forgetDraft(snapshot.id);
          else rememberDraft(this.document, this.diskRevision);
          this.status =
            generation === this.generation
              ? "Все изменения сохранены"
              : "Есть изменения";
          this.error = "";
          this.emit(false);
        }
      } catch (e) {
        this.error =
          e instanceof Error ? e.message : "Не удалось сохранить документ.";
        this.status = "Ошибка сохранения";
        this.emit(false);
        throw e;
      }
    });
    this.saveQueue = job.catch(() => {});
    return job;
  }
}
export const studio = new Studio();
