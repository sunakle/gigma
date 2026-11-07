import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { DocumentStore } from "../desktop/document-store";
import {
  newDocument,
  newNode,
  newPage,
  validateDocument,
} from "../shared/model";
import {
  duplicateNodes,
  groupNodes,
  moveNodes,
  screenToWorld,
} from "../src/core/geometry";
import { exportSVG } from "../src/core/svg";
describe("Файловое хранилище", () => {
  let folder: string, store: DocumentStore;
  beforeEach(async () => {
    const base = resolve("test-results/unit");
    await mkdir(base, { recursive: true });
    folder = await mkdtemp(join(base, "store-"));
    store = new DocumentStore(folder);
  });
  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });
  it("записывает и открывает редактируемые объекты в новом экземпляре", async () => {
    const d = newDocument("Лист");
    d.pages[0].nodes.push(newNode("rect", 10, 20));
    await store.save(d, 0);
    const again = new DocumentStore(folder);
    expect((await again.list())[0]).toMatchObject({
      id: d.id,
      name: "Лист",
      objects: 1,
    });
    expect((await again.load(d.id)).document.pages).toEqual(d.pages);
  });
  it("не перезаписывает версию параллельного окна", async () => {
    const d = newDocument();
    await store.save(d, 0);
    const jobs = await Promise.allSettled([
      store.save({ ...d, name: "Первое" }, 1),
      new DocumentStore(folder).save({ ...d, name: "Второе" }, 1),
    ]);
    expect(jobs.filter((j) => j.status === "fulfilled")).toHaveLength(1);
    expect((await store.load(d.id)).document.revision).toBe(2);
  });
  it("восстанавливает резервную копию после повреждения и потери основного файла", async () => {
    const d = newDocument("Первый");
    await store.save(d, 0);
    await store.save({ ...d, name: "Второй" }, 1);
    const path = join(folder, d.id + ".gigma");
    await writeFile(path, "{broken");
    expect((await store.load(d.id)).recovered).toBe(true);
    await rm(path);
    const backup = await store.load(d.id);
    expect(backup.document.name).toBe("Первый");
    await store.save(backup.document, 1);
    expect(JSON.parse(await readFile(path, "utf8")).revision).toBe(2);
  });
  it("отклоняет некорректный документ до записи", async () => {
    const d = newDocument();
    await store.save(d, 0);
    await expect(store.save({ ...d, schemaVersion: 77 }, 1)).rejects.toThrow();
    expect((await store.load(d.id)).document.revision).toBe(1);
  });
});
describe("Геометрия и формат", () => {
  it("учитывает масштаб и перемещение холста", () => {
    expect(
      screenToWorld(
        { x: 170, y: 100 },
        { left: 10, top: 10 },
        { x: 60, y: 40, zoom: 2 },
      ),
    ).toEqual({ x: 50, y: 25 });
  });
  it("перемещает потомков группы и копирует независимо", () => {
    const p = newPage(),
      a = newNode("rect", 10, 20),
      b = newNode("ellipse", 210, 20);
    p.nodes.push(a, b);
    const id = groupNodes(p, [a.id, b.id])!;
    moveNodes(p.nodes, [id], 15, 4);
    expect(a.x).toBe(25);
    const [copy] = duplicateNodes(p, [id]);
    const children = p.nodes.filter((n) => n.parentId === copy);
    expect(children).toHaveLength(2);
    moveNodes(p.nodes, [copy], 100, 0);
    expect(a.x).toBe(25);
  });
  it("отклоняет циклы и повтор UUID между страницами", () => {
    const d = newDocument(),
      node = newNode("frame", 0, 0);
    d.pages[0].nodes = [node];
    node.parentId = node.id;
    expect(() => validateDocument(d)).toThrow();
    node.parentId = null;
    d.pages.push({ ...newPage(), nodes: [structuredClone(node)] });
    expect(() => validateDocument(d)).toThrow();
  });
  it("экранирует текст и сохраняет обрезку кадра в SVG", () => {
    const p = newPage(),
      frame = newNode("frame", 10, 20),
      t = newNode("text", 20, 30);
    t.parentId = frame.id;
    t.text = "A < B & C";
    p.nodes = [frame, t];
    const svg = exportSVG(p);
    expect(svg).toContain("A &lt; B &amp; C");
    expect(svg).toContain("clipPath");
  });
});
