import {
  newNode,
  uid,
  type DesignNode,
  type DesignPage,
  type DesignDocument,
} from "../../shared/model";
export type Point = { x: number; y: number };
export type Bounds = Point & { width: number; height: number };
export const container = (n: DesignNode) =>
  n.kind === "frame" || n.kind === "group";
export function descendants(nodes: DesignNode[], ids: string[]) {
  const set = new Set(ids);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (n.parentId && set.has(n.parentId) && !set.has(n.id)) {
        set.add(n.id);
        changed = true;
      }
  }
  return set;
}
export function roots(nodes: DesignNode[], ids: string[]) {
  const selected = new Set(ids),
    byId = new Map(nodes.map((n) => [n.id, n]));
  return ids.filter((id) => {
    let parent = byId.get(id)?.parentId;
    while (parent) {
      if (selected.has(parent)) return false;
      parent = byId.get(parent)?.parentId;
    }
    return true;
  });
}
// An explicit click on a layer/shape takes precedence over a previously selected ancestor.
export function toggleObject(
  nodes: DesignNode[],
  selected: string[],
  id: string,
) {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  function ancestorOf(ancestor: string, child: string) {
    let parent = byId.get(child)?.parentId;
    while (parent) {
      if (parent === ancestor) return true;
      parent = byId.get(parent)?.parentId;
    }
    return false;
  }
  return [
    ...selected.filter((s) => !ancestorOf(s, id) && !ancestorOf(id, s)),
    id,
  ];
}
export function inherited(
  nodes: DesignNode[],
  node: DesignNode,
  key: "hidden" | "locked",
) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let n: DesignNode | undefined = node;
  while (n) {
    if (n[key]) return true;
    n = n.parentId ? byId.get(n.parentId) : undefined;
  }
  return false;
}
export function bounds(n: DesignNode): Bounds {
  if (!n.rotation) return { x: n.x, y: n.y, width: n.width, height: n.height };
  const a = (n.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    cx = n.x + n.width / 2,
    cy = n.y + n.height / 2;
  const points = [
    [-n.width / 2, -n.height / 2],
    [n.width / 2, -n.height / 2],
    [-n.width / 2, n.height / 2],
    [n.width / 2, n.height / 2],
  ].map(([x, y]) => ({ x: cx + x * c - y * s, y: cy + x * s + y * c }));
  return union(points.map((p) => ({ ...p, width: 0, height: 0 })))!;
}
export function union(items: Bounds[]): Bounds | null {
  if (!items.length) return null;
  const x = Math.min(...items.map((n) => n.x)),
    y = Math.min(...items.map((n) => n.y)),
    r = Math.max(...items.map((n) => n.x + n.width)),
    b = Math.max(...items.map((n) => n.y + n.height));
  return { x, y, width: Math.max(1, r - x), height: Math.max(1, b - y) };
}
export function selectionBounds(nodes: DesignNode[], ids: string[]) {
  return union(nodes.filter((n) => ids.includes(n.id)).map(bounds));
}
export const contains = (a: Bounds, p: Point) =>
  p.x >= a.x && p.x <= a.x + a.width && p.y >= a.y && p.y <= a.y + a.height;
export const intersects = (a: Bounds, b: Bounds) =>
  a.x <= b.x + b.width &&
  a.x + a.width >= b.x &&
  a.y <= b.y + b.height &&
  a.y + a.height >= b.y;
export function proportionalResize(
  from: Bounds,
  to: Bounds,
  handle: string,
): Bounds {
  const horizontal = to.width / from.width;
  const vertical = to.height / from.height;
  const corner = handle.length === 2;
  const scale = corner
    ? Math.abs(horizontal - 1) >= Math.abs(vertical - 1)
      ? horizontal
      : vertical
    : handle === "e" || handle === "w"
      ? horizontal
      : vertical;
  const safeScale = Math.max(scale, 1 / from.width, 1 / from.height);
  const width = from.width * safeScale;
  const height = from.height * safeScale;
  return {
    x: handle.includes("w")
      ? from.x + from.width - width
      : handle.includes("e")
        ? from.x
        : from.x + (from.width - width) / 2,
    y: handle.includes("n")
      ? from.y + from.height - height
      : handle.includes("s")
        ? from.y
        : from.y + (from.height - height) / 2,
    width,
    height,
  };
}
export function moveNodes(
  nodes: DesignNode[],
  ids: string[],
  dx: number,
  dy: number,
) {
  const all = descendants(nodes, roots(nodes, ids));
  for (const n of nodes)
    if (all.has(n.id)) {
      n.x += dx;
      n.y += dy;
    }
}
export function resizeNodes(
  nodes: DesignNode[],
  ids: string[],
  from: Bounds,
  to: Bounds,
) {
  const all = descendants(nodes, roots(nodes, ids)),
    sx = to.width / from.width,
    sy = to.height / from.height;
  for (const n of nodes)
    if (all.has(n.id)) {
      n.x = to.x + (n.x - from.x) * sx;
      n.y = to.y + (n.y - from.y) * sy;
      n.width = Math.max(1, n.width * sx);
      n.height = Math.max(1, n.height * sy);
      n.points = n.points.map((p) => ({ ...p, x: p.x * sx, y: p.y * sy }));
      if (n.kind === "text") {
        const originalFontSize = n.fontSize;
        n.fontSize = Math.max(6, Math.min(1000, originalFontSize * sy));
        n.textScaleX = Math.max(
          0.001,
          Math.min(
            1000,
            ((n.textScaleX ?? 1) * sx * originalFontSize) / n.fontSize,
          ),
        );
      }
    }
}
export function refreshGroups(nodes: DesignNode[]) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, DesignNode[]>();
  for (const n of nodes)
    if (n.parentId) {
      const siblings = children.get(n.parentId) ?? [];
      siblings.push(n);
      children.set(n.parentId, siblings);
    }
  const depth = (n: DesignNode) => {
    let level = 0,
      parent = n.parentId;
    while (parent) {
      level++;
      parent = byId.get(parent)?.parentId ?? null;
    }
    return level;
  };
  for (const n of nodes
    .filter((n) => n.kind === "group")
    .sort((a, b) => depth(b) - depth(a))) {
    const b = union((children.get(n.id) ?? []).map(bounds));
    if (b) Object.assign(n, b);
  }
}
export function reparentNode(
  page: DesignPage,
  id: string,
  parentId: string | null,
) {
  const node = page.nodes.find((n) => n.id === id);
  const parent = page.nodes.find((n) => n.id === parentId);
  if (!node || (parentId && (!parent || !container(parent)))) return false;
  if (node.parentId === parentId) return false;
  let ancestor = parent;
  while (ancestor) {
    if (ancestor.id === id) return false;
    ancestor = page.nodes.find((n) => n.id === ancestor?.parentId);
  }
  const subtree = descendants(page.nodes, [id]);
  const moved = page.nodes.filter((n) => subtree.has(n.id));
  page.nodes = page.nodes.filter((n) => !subtree.has(n.id));
  node.parentId = parentId;
  let lastChild = -1;
  for (let i = page.nodes.length - 1; i >= 0; i--)
    if (page.nodes[i].parentId === parentId) {
      lastChild = i;
      break;
    }
  const target = parentId
    ? page.nodes.findIndex((n) => n.id === parentId)
    : page.nodes.length;
  page.nodes.splice(lastChild >= 0 ? lastChild + 1 : target + 1, 0, ...moved);
  refreshGroups(page.nodes);
  return true;
}
export function reorderNode(
  page: DesignPage,
  id: string,
  targetId: string,
  position: "before" | "after",
) {
  const node = page.nodes.find((n) => n.id === id);
  const target = page.nodes.find((n) => n.id === targetId);
  if (!node || !target || id === targetId) return false;
  const subtree = descendants(page.nodes, [id]);
  if (subtree.has(targetId)) return false;
  const moved = page.nodes.filter((n) => subtree.has(n.id));
  page.nodes = page.nodes.filter((n) => !subtree.has(n.id));
  node.parentId = target.parentId;
  const targetSubtree = descendants(page.nodes, [targetId]);
  const index =
    position === "before"
      ? page.nodes.findIndex((n) => n.id === targetId)
      : page.nodes.reduce(
          (last, n, i) => (targetSubtree.has(n.id) ? i + 1 : last),
          0,
        );
  page.nodes.splice(index, 0, ...moved);
  refreshGroups(page.nodes);
  return true;
}
export function groupNodes(page: DesignPage, ids: string[]) {
  const selected = roots(page.nodes, ids),
    b = selectionBounds(page.nodes, selected);
  if (!b || selected.length < 2) return null;
  const group = newNode("group", b.x, b.y, b.width, b.height);
  const parents = new Set(
    page.nodes.filter((n) => selected.includes(n.id)).map((n) => n.parentId),
  );
  group.parentId = parents.size === 1 ? [...parents][0] : null;
  page.nodes.push(group);
  for (const n of page.nodes)
    if (selected.includes(n.id)) n.parentId = group.id;
  return group.id;
}
export function ungroupNodes(page: DesignPage, ids: string[]) {
  const selected = page.nodes.filter(
      (n) => ids.includes(n.id) && n.kind === "group",
    ),
    children: string[] = [];
  for (const g of selected)
    for (const n of page.nodes)
      if (n.parentId === g.id) {
        n.parentId = g.parentId;
        children.push(n.id);
      }
  page.nodes = page.nodes.filter((n) => !selected.includes(n));
  return children;
}
export function duplicateNodes(
  page: DesignPage,
  ids: string[],
  offset = 24,
  source = page.nodes,
) {
  const all = descendants(source, roots(source, ids)),
    map = new Map([...all].map((id) => [id, uid()])),
    copied = source
      .filter((n) => all.has(n.id))
      .map((n) => ({
        ...structuredClone(n),
        id: map.get(n.id)!,
        name: ids.includes(n.id) ? n.name + " копия" : n.name,
        parentId:
          n.parentId && map.has(n.parentId)
            ? map.get(n.parentId)!
            : page.nodes.some((p) => p.id === n.parentId)
              ? n.parentId
              : null,
        x: n.x + offset,
        y: n.y + offset,
        linkTo: n.linkTo && map.has(n.linkTo) ? map.get(n.linkTo)! : n.linkTo,
      }));
  page.nodes.push(...copied);
  return roots(source, ids).map((id) => map.get(id)!);
}
export function removeNodes(
  doc: DesignDocument,
  page: DesignPage,
  ids: string[],
) {
  const all = descendants(page.nodes, ids);
  page.nodes = page.nodes.filter((n) => !all.has(n.id));
  for (const p of doc.pages)
    for (const n of p.nodes) if (n.linkTo && all.has(n.linkTo)) n.linkTo = null;
  refreshGroups(page.nodes);
}
export function alignNodes(
  nodes: DesignNode[],
  ids: string[],
  axis: "left" | "center" | "right" | "top" | "middle" | "bottom",
) {
  const selected = roots(nodes, ids),
    b = selectionBounds(nodes, selected);
  if (!b || selected.length < 2) return;
  for (const id of selected) {
    const n = nodes.find((n) => n.id === id)!,
      r = bounds(n);
    const x =
      axis === "left"
        ? b.x
        : axis === "center"
          ? b.x + (b.width - r.width) / 2
          : axis === "right"
            ? b.x + b.width - r.width
            : r.x;
    const y =
      axis === "top"
        ? b.y
        : axis === "middle"
          ? b.y + (b.height - r.height) / 2
          : axis === "bottom"
            ? b.y + b.height - r.height
            : r.y;
    moveNodes(nodes, [id], x - r.x, y - r.y);
  }
  refreshGroups(nodes);
}
export function autoLayout(
  page: DesignPage,
  id: string,
  layout: "free" | "horizontal" | "vertical",
) {
  const n = page.nodes.find((n) => n.id === id);
  if (!n || !container(n)) return;
  n.layout = layout;
  if (layout === "free") return;
  const children = page.nodes.filter((c) => c.parentId === id && !c.hidden);
  let cursor = n.padding;
  for (const c of children) {
    const x = n.x + (layout === "horizontal" ? cursor : n.padding),
      y = n.y + (layout === "vertical" ? cursor : n.padding);
    moveNodes(page.nodes, [c.id], x - c.x, y - c.y);
    cursor += (layout === "horizontal" ? c.width : c.height) + n.gap;
  }
  if (children.length) {
    n.width =
      layout === "horizontal"
        ? cursor - n.gap + n.padding
        : Math.max(...children.map((c) => c.width)) + n.padding * 2;
    n.height =
      layout === "vertical"
        ? cursor - n.gap + n.padding
        : Math.max(...children.map((c) => c.height)) + n.padding * 2;
  }
  refreshGroups(page.nodes);
}
export function screenToWorld(
  p: Point,
  rect: { left: number; top: number },
  view: { x: number; y: number; zoom: number },
): Point {
  return {
    x: (p.x - rect.left - view.x) / view.zoom,
    y: (p.y - rect.top - view.y) / view.zoom,
  };
}
