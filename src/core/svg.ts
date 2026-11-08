import type { DesignNode, DesignPage } from "../../shared/model";
import { bounds, union, type Bounds, descendants } from "./geometry";
import { textLines } from "./text-layout";
import { vectorXML } from "../../shared/vector";
import { brushOutline } from "./brush";
import { adjustmentMarkup } from "../../shared/adjustments";
export function effectDefs(n: DesignNode, id: string) {
  return n.adjustments?.length
    ? '<defs><filter id="' +
        id +
        '" color-interpolation-filters="sRGB">' +
        n.adjustments.map(adjustmentMarkup).join("") +
        "</filter></defs>"
    : "";
}
const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function paintChannel(n: DesignNode): "fill" | "stroke" | null {
  if (
    n.kind === "image" ||
    (n.kind === "vector" && !n.artwork?.editablePaint) ||
    n.kind === "group"
  )
    return null;
  return ["line", "arrow", "path"].includes(n.kind) ||
    (n.kind === "vector" && n.fill === "none" && n.stroke !== "none")
    ? "stroke"
    : "fill";
}
export function nodeSVG(n: DesignNode, preview = false): string {
  const channel = preview ? paintChannel(n) : null;
  const fill = channel === "fill" ? `var(--gigma-paint, ${n.fill})` : n.fill;
  const stroke =
    channel === "stroke" ? `var(--gigma-paint, ${n.stroke})` : n.stroke;
  const style = `fill-opacity="${n.fillOpacity ?? 1}" fill="${fill}" stroke="${stroke}" stroke-width="${n.strokeWidth}" opacity="${n.opacity}"`;
  let inner = "";
  if (n.kind === "rect" || n.kind === "frame")
    inner = `<rect width="${n.width}" height="${n.height}" rx="${Math.min(n.radius, n.width / 2, n.height / 2)}" ${style}/>`;
  if (n.kind === "polygon") {
    const sides = n.sides ?? 6;
    const points = Array.from({ length: sides }, (_, i) => {
      const a = (i * 2 * Math.PI) / sides - Math.PI / 2;
      return (
        ((1 + Math.cos(a)) * n.width) / 2 +
        "," +
        ((1 + Math.sin(a)) * n.height) / 2
      );
    });
    inner = '<polygon points="' + points.join(" ") + '" ' + style + "/>";
  }
  if (n.kind === "ellipse")
    inner = `<ellipse cx="${n.width / 2}" cy="${n.height / 2}" rx="${n.width / 2}" ry="${n.height / 2}" ${style}/>`;
  if (["line", "arrow", "path"].includes(n.kind)) {
    const points = n.points.length
      ? n.points
      : [
          { x: 0, y: 0 },
          { x: n.width, y: n.height },
        ];
    inner = `<polyline points="${points.map((p) => `${p.x},${p.y}`).join(" ")}" fill="none" stroke="${stroke}" stroke-width="${n.strokeWidth}" stroke-linejoin="round" stroke-linecap="round" opacity="${n.opacity}"/>`;
    if (n.kind === "path" && points.some((p) => p.pressure !== undefined)) {
      const first = points[0],
        last = points[points.length - 1];
      inner =
        '<g fill="' +
        stroke +
        '" opacity="' +
        n.opacity +
        '"><path d="' +
        brushOutline(points, n.strokeWidth) +
        '"/>' +
        [first, last]
          .map(
            (p) =>
              '<circle cx="' +
              p.x +
              '" cy="' +
              p.y +
              '" r="' +
              (n.strokeWidth * (p.pressure ?? 1)) / 2 +
              '"/>',
          )
          .join("") +
        "</g>";
    }
    if (n.kind === "arrow" && points.length > 1) {
      const e = points.at(-1)!,
        p = points.at(-2)!,
        a = Math.atan2(e.y - p.y, e.x - p.x),
        r = Math.max(8, n.strokeWidth * 4);
      inner += `<path d="M ${e.x - r * Math.cos(a - 0.45)} ${e.y - r * Math.sin(a - 0.45)} L ${e.x} ${e.y} L ${e.x - r * Math.cos(a + 0.45)} ${e.y - r * Math.sin(a + 0.45)}" fill="none" stroke="${stroke}" stroke-width="${n.strokeWidth}" stroke-linecap="round" opacity="${n.opacity}"/>`;
    }
  }
  if (n.kind === "text") {
    const x =
      n.textAlign === "center"
        ? n.width / 2
        : n.textAlign === "right"
          ? n.width
          : 0;
    inner = `<text x="${x}" y="${n.fontSize}" fill="${fill}" opacity="${n.opacity}" font-size="${n.fontSize}" font-family="${esc(n.fontFamily)}, sans-serif" font-weight="${n.fontWeight}" text-anchor="${n.textAlign === "center" ? "middle" : n.textAlign === "right" ? "end" : "start"}" xml:space="preserve" fill-opacity="${n.fillOpacity ?? 1}">${textLines(
      n,
    )
      .map(
        (line, i) =>
          `<tspan x="${x}" dy="${i ? n.fontSize * 1.3 : 0}">${esc(line) || " "}</tspan>`,
      )
      .join("")}</text>`;
  }
  if (n.kind === "vector" && n.artwork) {
    const { box, elements, editablePaint } = n.artwork;
    const paint = editablePaint ? style : `opacity="${n.opacity}"`;
    inner = `<svg xmlns:xlink="http://www.w3.org/1999/xlink" width="${n.width}" height="${n.height}" viewBox="${box.join(" ")}" preserveAspectRatio="none" overflow="visible" ${paint}>${elements.map((e) => vectorXML(e, "ai-" + n.id + "-")).join("")}</svg>`;
  }
  if (n.kind === "image" && n.image)
    inner = `<image href="${esc(n.image)}" width="${n.width}" height="${n.height}" preserveAspectRatio="none" opacity="${n.opacity}"/>`;
  return `<g transform="translate(${n.x} ${n.y}) rotate(${n.rotation} ${n.width / 2} ${n.height / 2})">${inner}</g>`;
}
export function pageMarkup(page: DesignPage, selection?: string[]) {
  const allowed = selection ? descendants(page.nodes, selection) : null;
  const draw = (n: DesignNode): string => {
    const id = "fx-" + n.id;
    return (
      effectDefs(n, id) +
      '<g style="mix-blend-mode:' +
      (n.blend ?? "normal") +
      '" ' +
      (n.adjustments?.length ? 'filter="url(#' + id + ')"' : "") +
      ">" +
      content(n) +
      "</g>"
    );
  };
  const content = (n: DesignNode): string => {
    if (n.hidden) return "";
    const children = page.nodes.filter((c) => c.parentId === n.id);
    if (n.kind === "group")
      return `<g opacity="${n.opacity}">${children.map(draw).join("")}</g>`;
    let result = nodeSVG(n.kind === "frame" ? { ...n, opacity: 1 } : n);
    if (n.kind === "frame") {
      const clip = n.clip ? `clip-path="url(#clip-${n.id})"` : "";
      result += `${n.clip ? `<defs><clipPath id="clip-${n.id}"><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="${n.radius}"/></clipPath></defs>` : ""}<g ${clip}>${children.map(draw).join("")}</g>`;
    }
    return n.kind === "frame"
      ? `<g opacity="${n.opacity}">${result}</g>`
      : result;
  };
  return page.nodes
    .filter(
      (n) =>
        (!n.parentId || (allowed && !allowed.has(n.parentId))) &&
        (!allowed || allowed.has(n.id)),
    )
    .map(draw)
    .join("");
}
export function exportBounds(page: DesignPage, selection?: string[]): Bounds {
  const allowed = selection ? descendants(page.nodes, selection) : null;
  const byId = new Map(page.nodes.map((n) => [n.id, n]));
  const visible: Bounds[] = [];
  for (const n of page.nodes) {
    if (n.kind === "group" || (allowed && !allowed.has(n.id))) continue;
    const shape = bounds(n);
    const border = n.stroke === "none" ? 0 : n.strokeWidth / 2;
    let margin = border;
    if (n.kind === "arrow" && border > 0)
      margin += Math.max(8, n.strokeWidth * 4);
    let x = shape.x - margin,
      y = shape.y - margin,
      right = shape.x + shape.width + margin,
      bottom = shape.y + shape.height + margin;
    let ancestor: DesignNode | undefined = n,
      hidden = false;
    while (ancestor) {
      if (ancestor.hidden) {
        hidden = true;
        break;
      }
      if (ancestor !== n && ancestor.kind === "frame" && ancestor.clip) {
        x = Math.max(x, ancestor.x);
        y = Math.max(y, ancestor.y);
        right = Math.min(right, ancestor.x + ancestor.width);
        bottom = Math.min(bottom, ancestor.y + ancestor.height);
      }
      ancestor =
        ancestor.parentId && (!allowed || allowed.has(ancestor.parentId))
          ? byId.get(ancestor.parentId)
          : undefined;
    }
    if (!hidden && right > x && bottom > y)
      visible.push({ x, y, width: right - x, height: bottom - y });
  }
  return union(visible) ?? { x: 0, y: 0, width: 800, height: 600 };
}
export function exportSVG(page: DesignPage, selection?: string[]) {
  const b = exportBounds(page, selection);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(b.width)}" height="${Math.ceil(b.height)}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}">${pageMarkup(page, selection)}</svg>`;
}
export async function svgPNG(svg: string, scale = 1, maxDimension = 8192) {
  const blob = new Blob([svg], { type: "image/svg+xml" }),
    url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const w = Math.ceil(image.naturalWidth * scale),
      h = Math.ceil(image.naturalHeight * scale);
    if (w > maxDimension || h > maxDimension || w * h > 32e6)
      throw new Error(
        "Экспорт превышает 8192 px или 32 млн пикселей. Выберите отдельный кадр.",
      );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, w);
    canvas.height = Math.max(1, h);
    canvas.getContext("2d")!.drawImage(image, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) =>
        b ? resolve(b) : reject(new Error("Не удалось создать PNG.")),
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function coverFor(page: DesignPage) {
  try {
    const b = exportBounds(page),
      svg = exportSVG(page);
    const image = await svgPNG(
      svg,
      Math.min(1, 295 / Math.max(b.width, b.height)),
    );
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(image);
    });
  } catch {
    return "";
  }
}
export function download(
  data: Blob | string,
  name: string,
  type = "application/json",
) {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export const fileName = (s: string) =>
  s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").slice(0, 120) || "document";
