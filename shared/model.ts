import { adjustmentKinds } from "./adjustments";
import { z } from "zod";
import { artworkSchema } from "./vector";

export const kinds = [
  "frame",
  "rect",
  "ellipse",
  "line",
  "arrow",
  "path",
  "text",
  "image",
  "group",
  "polygon",
  "vector",
] as const;
const point = z.object({
  pressure: z.number().min(0).max(1).optional(),
  x: z.number().finite().min(-1e6).max(1e6),
  y: z.number().finite().min(-1e6).max(1e6),
});
const color = z.string().regex(/^(#[0-9a-fA-F]{6}|none)$/);
export const nodeSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(kinds),
  name: z.string().max(200),
  parentId: z.string().uuid().nullable(),
  x: z.number().finite().min(-1e6).max(1e6),
  y: z.number().finite().min(-1e6).max(1e6),
  width: z.number().min(1).max(100000),
  height: z.number().min(1).max(100000),
  artLayer: z.boolean().optional(),
  sides: z.number().int().min(3).max(32).optional(),
  fillOpacity: z.number().min(0).max(1).optional(),
  blend: z
    .enum([
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "difference",
      "soft-light",
    ])
    .optional(),
  adjustments: z
    .array(
      z.object({
        kind: z.enum(adjustmentKinds),
        amount: z.number().min(-100).max(100),
        contrast: z.number().min(-100).max(100).optional(),
        low: color.optional(),
        high: color.optional(),
      }),
    )
    .max(16)
    .optional(),
  textLayout: z.enum(["auto", "wrap"]).optional(),
  rotation: z.number().min(-360).max(360),
  fill: color,
  stroke: color,
  strokeWidth: z.number().min(0).max(200),
  opacity: z.number().min(0).max(1),
  radius: z.number().min(0).max(50000),
  hidden: z.boolean(),
  locked: z.boolean(),
  text: z.string().max(100000),
  fontSize: z.number().min(6).max(1000),
  fontFamily: z.enum(["Inter", "Arial", "Georgia", "monospace"]),
  fontWeight: z.enum(["400", "500", "600", "700"]),
  textAlign: z.enum(["left", "center", "right"]),
  points: z.array(point).max(20000),
  artwork: artworkSchema.optional(),
  image: z
    .string()
    .max(15e6)
    .refine(
      (s) =>
        s === "" ||
        /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(s),
      "Недопустимое изображение",
    ),
  clip: z.boolean(),
  linkTo: z.string().uuid().nullable(),
  layout: z.enum(["free", "horizontal", "vertical"]),
  gap: z.number().min(0).max(1000),
  padding: z.number().min(0).max(1000),
});
export type DesignNode = z.infer<typeof nodeSchema>;
export type Kind = DesignNode["kind"];
export const pageSchema = z.object({
  id: z.string().uuid(),
  name: z.string().max(200),
  nodes: z.array(nodeSchema).max(20000),
  view: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    zoom: z.number().min(0.02).max(32),
  }),
});
export const documentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  mode: z.enum(["design", "board"]),
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  pages: z.array(pageSchema).min(1).max(32),
  activePageId: z.string().uuid(),
  cover: z
    .string()
    .max(500000)
    .refine(
      (s) => s === "" || /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(s),
    ),
});
export type DesignDocument = z.infer<typeof documentSchema>;
export type DesignPage = DesignDocument["pages"][number];
export type Summary = {
  id: string;
  name: string;
  mode: DesignDocument["mode"];
  revision: number;
  updatedAt: string;
  pages: number;
  objects: number;
  cover: string;
};
export type LoadResult = { document: DesignDocument; recovered: boolean };
export type SaveResult = { revision: number; updatedAt: string };
export type IllustratorArtwork = {
  name: string;
  svg: string;
  layers: string;
  pixels?: string;
};
export interface StorageAPI {
  list(): Promise<Summary[]>;
  load(id: string): Promise<LoadResult>;
  save(doc: DesignDocument, expectedRevision: number): Promise<SaveResult>;
  config(): Promise<{ folder: string; desktop: boolean }>;
  openFolder(): Promise<void>;
  openIllustrator?(): Promise<IllustratorArtwork | null>;
  illustrator?(payload: {
    mode: "export";
    document: DesignDocument;
    selection?: string[];
  }): Promise<Uint8Array>;
  onBeforeClose?(callback: () => Promise<void>): () => void;
}
export function validateDocument(value: unknown): DesignDocument {
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      "Документ повреждён или имеет неподдерживаемый формат: " +
        parsed.error.issues[0].path.join("."),
    );
  const d = parsed.data;
  let total = 0,
    points = 0;
  const pageIds = new Set(d.pages.map((p) => p.id));
  if (pageIds.size !== d.pages.length || !pageIds.has(d.activePageId))
    throw new Error("Нарушен список страниц.");
  const allIds = new Set<string>();
  const frames = new Set(
    d.pages.flatMap((p) =>
      p.nodes.filter((n) => n.kind === "frame").map((n) => n.id),
    ),
  );
  for (const page of d.pages) {
    total += page.nodes.length;
    const nodes = new Map(page.nodes.map((n) => [n.id, n]));
    if (nodes.size !== page.nodes.length)
      throw new Error("Повторяются идентификаторы объектов.");
    for (const node of page.nodes) {
      if (allIds.has(node.id))
        throw new Error("Идентификатор объекта повторяется.");
      if (node.kind === "vector" && !node.artwork)
        throw Error("Отсутствует векторная графика.");
      allIds.add(node.id);
      points += node.points.length;
      if (node.linkTo && !frames.has(node.linkTo))
        throw new Error("Ссылка ведёт на отсутствующий кадр.");
      let next = node.parentId;
      const visited = new Set([node.id]);
      while (next) {
        if (visited.has(next)) throw new Error("Цикл в слоях документа.");
        if (visited.size > 64)
          throw new Error("Слишком глубокая вложенность слоёв.");
        visited.add(next);
        const parent = nodes.get(next);
        if (!parent || !["group", "frame"].includes(parent.kind))
          throw new Error("Отсутствует родительский слой.");
        next = parent.parentId;
      }
    }
  }
  if (total > 20000 || points > 200000)
    throw new Error(
      "Документ слишком большой: максимум 20 000 объектов и 200 000 точек пера.",
    );
  return d;
}
export const uid = () => crypto.randomUUID();
export function newPage(name = "Страница 1"): DesignPage {
  return { id: uid(), name, nodes: [], view: { x: 100, y: 90, zoom: 1 } };
}
export function newDocument(
  name = "Без названия",
  mode: DesignDocument["mode"] = "design",
): DesignDocument {
  const p = newPage(),
    now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: uid(),
    name,
    mode,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    pages: [p],
    activePageId: p.id,
    cover: "",
  };
}
const names: Record<Kind, string> = {
  frame: "Кадр",
  rect: "Прямоугольник",
  ellipse: "Эллипс",
  line: "Линия",
  arrow: "Стрелка",
  path: "Рисунок",
  text: "Текст",
  image: "Изображение",
  group: "Группа",
  polygon: "Многоугольник",
  vector: "Вектор",
};
export function newNode(
  kind: Kind,
  x: number,
  y: number,
  width = 160,
  height = 100,
): DesignNode {
  return {
    id: uid(),
    kind,
    name: names[kind],
    parentId: null,
    x,
    y,
    width,
    height,
    rotation: 0,
    fill:
      kind === "frame"
        ? "#ffffff"
        : kind === "text"
          ? "#202124"
          : ["line", "arrow", "path", "group"].includes(kind)
            ? "none"
            : "#d9d9d9",
    stroke: ["line", "arrow", "path"].includes(kind) ? "#202124" : "none",
    strokeWidth: ["line", "arrow", "path"].includes(kind) ? 2 : 1,
    opacity: 1,
    radius: 0,
    hidden: false,
    locked: false,
    text: kind === "text" ? "Текст" : "",
    fontSize: 24,
    fontFamily: "Inter",
    fontWeight: "400",
    textAlign: "left",
    points: [],
    image: "",
    clip: kind === "frame",
    linkTo: null,
    layout: "free",
    gap: 16,
    padding: 24,
  };
}
export function summary(d: DesignDocument): Summary {
  return {
    id: d.id,
    name: d.name,
    mode: d.mode,
    revision: d.revision,
    updatedAt: d.updatedAt,
    pages: d.pages.length,
    objects: d.pages.reduce((s, p) => s + p.nodes.length, 0),
    cover: d.cover,
  };
}
