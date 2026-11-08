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
  liftNodes,
  moveNodes,
  proportionalResize,
  reparentNode,
  reorderNode,
  separateToLayer,
  screenToWorld,
} from "../src/core/geometry";
import { exportSVG } from "../src/core/svg";
import {
  fitText,
  textHorizontalScale,
  textLines,
  textVerticalScale,
} from "../src/core/text-layout";
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
  it("удерживает длинный деформированный текст внутри его рамки", () => {
    const n = newNode("text", 0, 0, 4500, 2025);
    n.text = "грибочек";
    n.textLayout = "wrap";
    n.fontSize = 1000;
    n.textScaleX = 4;
    const height = n.height;
    expect(textLines(n).length).toBeGreaterThan(2);
    expect(textVerticalScale(n)).toBeLessThan(1);
    expect(
      textVerticalScale(n) * textLines(n).length * n.fontSize * 1.3,
    ).toBeLessThanOrEqual(height);
    n.text = "грибочек лес";
    fitText(n);
    expect(n.height).toBe(height);
    expect(
      textVerticalScale(n) * textLines(n).length * n.fontSize * 1.3,
    ).toBeLessThanOrEqual(height);
  });
  it("восстанавливает ширину слишком сжатого текста в широкой рамке", () => {
    const n = newNode("text", 0, 0, 1000, 120);
    n.text = "лес";
    n.fontSize = 80;
    n.textLayout = "auto";
    n.textScaleX = 0.001;
    expect(textHorizontalScale(n)).toBeGreaterThan(1);
    expect(n.textScaleX).toBe(0.001);
  });
  it("вкладывает группу в группу и запрещает цикл", () => {
    const p = newPage(),
      outer = newNode("group", 0, 0),
      inner = newNode("group", 20, 30),
      shape = newNode("rect", 24, 36, 10, 12);
    shape.parentId = inner.id;
    p.nodes.push(outer, inner, shape);
    expect(reparentNode(p, inner.id, outer.id)).toBe(true);
    expect(inner.parentId).toBe(outer.id);
    expect(outer).toMatchObject({ x: 24, y: 36, width: 10, height: 12 });
    expect(reparentNode(p, outer.id, inner.id)).toBe(false);
    moveNodes(p.nodes, [outer.id], 8, 5);
    expect(shape).toMatchObject({ x: 32, y: 41 });
    expect(reparentNode(p, inner.id, null)).toBe(true);
    expect(inner.parentId).toBeNull();
  });
  it("переставляет слои и дочерние группы вместе с объектами", () => {
    const p = newPage();
    const a = newNode("group", 0, 0),
      b = newNode("group", 20, 0),
      aChild = newNode("rect", 0, 0),
      bChild = newNode("rect", 20, 0),
      c = newNode("rect", 40, 0);
    aChild.parentId = a.id;
    bChild.parentId = b.id;
    p.nodes.push(a, aChild, b, bChild, c);
    expect(reorderNode(p, b.id, a.id, "before")).toBe(true);
    expect(p.nodes.filter((n) => n.parentId === null).map((n) => n.id)).toEqual(
      [b.id, a.id, c.id],
    );
    expect(bChild.parentId).toBe(b.id);
    expect(reorderNode(p, aChild.id, bChild.id, "after")).toBe(true);
    expect(aChild.parentId).toBe(b.id);
    expect(p.nodes.filter((n) => n.parentId === b.id).map((n) => n.id)).toEqual(
      [bChild.id, aChild.id],
    );
    expect(reorderNode(p, b.id, aChild.id, "after")).toBe(false);
  });
  it("отделяет выбранные детали в самостоятельный слой монтажной области", () => {
    const p = newPage();
    const frame = newNode("frame", 0, 0, 300, 200);
    const original = newNode("group", 10, 10, 180, 100);
    original.artLayer = true;
    original.parentId = frame.id;
    const mushroom = newNode("group", 20, 20, 70, 60);
    mushroom.parentId = original.id;
    const cap = newNode("vector", 20, 20, 40, 30);
    const stem = newNode("rect", 30, 45, 15, 25);
    const other = newNode("rect", 140, 25, 20, 20);
    cap.parentId = stem.parentId = mushroom.id;
    other.parentId = original.id;
    p.nodes.push(frame, original, mushroom, cap, stem, other);
    const layerId = separateToLayer(p, [cap.id, stem.id])!;
    const layer = p.nodes.find((n) => n.id === layerId)!;
    expect(layer).toMatchObject({ artLayer: true, parentId: frame.id });
    expect(cap).toMatchObject({ parentId: layerId, x: 20, y: 20 });
    expect(stem).toMatchObject({ parentId: layerId, x: 30, y: 45 });
    expect(other.parentId).toBe(original.id);
    expect(liftNodes(p, [cap.id, stem.id])).toEqual([cap.id, stem.id]);
    expect(cap.parentId).toBe(frame.id);
    expect(stem.parentId).toBe(frame.id);
  });
  it("сохраняет пропорции и противоположную опору при растяжении", () => {
    const original = { x: 10, y: 20, width: 80, height: 40 };
    expect(
      proportionalResize(
        original,
        { x: 10, y: 20, width: 120, height: 50 },
        "se",
      ),
    ).toEqual({ x: 10, y: 20, width: 120, height: 60 });
    expect(
      proportionalResize(
        original,
        { x: 30, y: 25, width: 60, height: 35 },
        "nw",
      ),
    ).toEqual({ x: 30, y: 30, width: 60, height: 30 });
    expect(
      proportionalResize(
        original,
        { x: 30, y: 20, width: 60, height: 40 },
        "w",
      ),
    ).toEqual({ x: 30, y: 25, width: 60, height: 30 });
  });
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
