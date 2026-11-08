import type { DesignNode } from "../../shared/model";
import {
  bounds,
  container,
  contains,
  type Bounds,
  type Point,
} from "./geometry";

let mask: HTMLCanvasElement | undefined;

// SVG hit testing treats a raster's transparent padding as part of the image.
// Test its displayed pixels in small tiles, using the same screen transform as the canvas.
function touchesImage(image: SVGImageElement, area: Bounds) {
  const box = image.getBoundingClientRect(),
    matrix = image.getScreenCTM();
  if (!matrix) return false;
  const left = Math.max(area.x, box.left),
    top = Math.max(area.y, box.top);
  const right = Math.min(area.x + area.width, box.right),
    bottom = Math.min(area.y + area.height, box.bottom);
  if (right <= left || bottom <= top) return false;
  mask ??= document.createElement("canvas");
  const ctx = mask.getContext("2d", { willReadFrequently: true })!;
  const tile = 256;
  for (let y = top; y < bottom; y += tile) {
    for (let x = left; x < right; x += tile) {
      const w = Math.ceil(Math.min(tile, right - x)),
        h = Math.ceil(Math.min(tile, bottom - y));
      if (mask.width !== w) mask.width = w;
      if (mask.height !== h) mask.height = h;
      ctx.resetTransform();
      ctx.clearRect(0, 0, w, h);
      ctx.setTransform(
        matrix.a,
        matrix.b,
        matrix.c,
        matrix.d,
        matrix.e - x,
        matrix.f - y,
      );
      ctx.imageSmoothingEnabled =
        image.getAttribute("image-rendering") !== "pixelated";
      ctx.drawImage(
        image,
        image.x.baseVal.value,
        image.y.baseVal.value,
        image.width.baseVal.value,
        image.height.baseVal.value,
      );
      const rgba = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) return true;
    }
  }
  return false;
}

export function objectAt(svg: SVGSVGElement, x: number, y: number) {
  for (const element of document.elementsFromPoint(x, y)) {
    if (!svg.contains(element)) continue;
    const object = element.closest("[data-object]");
    if (!object) continue;
    if (
      element instanceof SVGImageElement &&
      element.parentElement === object &&
      !touchesImage(element, { x: x - 0.5, y: y - 0.5, width: 1, height: 1 })
    )
      continue;
    return object.getAttribute("data-object");
  }
  return null;
}

export function marqueeObjects(
  svg: SVGSVGElement,
  nodes: DesignNode[],
  start: Point,
  end: Point,
  world: Bounds,
  direct: boolean,
) {
  const client = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.max(1, Math.abs(end.x - start.x)),
    height: Math.max(1, Math.abs(end.y - start.y)),
  };
  const stage = svg.getBoundingClientRect();
  const rect = svg.createSVGRect();
  Object.assign(rect, {
    x: client.x - stage.left,
    y: client.y - stage.top,
    width: client.width,
    height: client.height,
  });
  const hits = new Set<string>();
  for (const element of Array.from(svg.getIntersectionList(rect, null))) {
    const object = element.closest("[data-object]");
    const id = object?.getAttribute("data-object");
    if (!id || hits.has(id)) continue;
    if (
      element instanceof SVGImageElement &&
      element.parentElement === object &&
      !touchesImage(element, client)
    )
      continue;
    hits.add(id);
  }
  const children = new Map<string | null, DesignNode[]>();
  for (const n of nodes) {
    let siblings = children.get(n.parentId);
    if (!siblings) children.set(n.parentId, (siblings = []));
    siblings.push(n);
  }
  const selected: string[] = [];
  function visit(n: DesignNode): boolean {
    if (n.hidden || n.locked || n.opacity === 0) return false;
    if (!container(n)) {
      if (hits.has(n.id)) selected.push(n.id);
      return hits.has(n.id);
    }
    const index = selected.length,
      items = children.get(n.id) ?? [];
    let all = true;
    for (const item of items) if (!visit(item)) all = false;
    // An Illustrator layer only organizes artwork. An ordinary group/frame can
    // stand in for its contents when the entire container was deliberately enclosed.
    const box = bounds(n);
    if (
      !direct &&
      !n.artLayer &&
      all &&
      (items.length || n.kind === "frame") &&
      contains(world, box) &&
      contains(world, { x: box.x + box.width, y: box.y + box.height })
    ) {
      selected.length = index;
      selected.push(n.id);
      return true;
    }
    return false;
  }
  for (const top of children.get(null) ?? []) visit(top);
  return selected;
}
