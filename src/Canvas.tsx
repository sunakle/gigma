import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointer,
} from "react";
import {
  newNode,
  type DesignNode,
  type DesignPage,
  type Kind,
} from "../shared/model";
import {
  bounds,
  contains,
  container,
  descendants,
  inherited,
  toggleObject,
  proportionalResize,
  resizeNodes,
  roots,
  screenToWorld,
  selectionBounds,
  type Bounds,
  type Point,
} from "./core/geometry";
import { usePrefs, preferences } from "./core/preferences";
import { InlineText } from "./InlineText";
import { fitText } from "./core/text-layout";
import { pressureFactor } from "./core/brush";
import { removeNodes } from "./core/geometry";
import {
  nodeSVG,
  nodeTransform,
  imageSampling,
  exportBounds,
  effectDefs,
} from "./core/svg";
import { marqueeObjects, objectAt } from "./core/canvas-selection";
import { studio } from "./core/studio";

export type Tool =
  | "select"
  | "pan"
  | "picker"
  | "eraser"
  | "direct"
  | Exclude<Kind, "image" | "group" | "vector">;
type Gesture = {
  type: "draw" | "move" | "resize" | "marquee" | "pan" | "erase" | "edit";
  pointerId: number;
  start: Point;
  client: Point;
  view: DesignPage["view"];
  original: DesignNode[];
  moving?: Element[];
  delta?: Point;
  selected: string[];
  box?: Bounds;
  handle?: string;
  id?: string;
  points: DesignNode["points"];
};
const boxBetween = (a: Point, b: Point): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.max(1, Math.abs(b.x - a.x)),
  height: Math.max(1, Math.abs(b.y - a.y)),
});
export function zoomAt(page: DesignPage, value: number, at?: Point) {
  const host = document.querySelector("[data-stage]")?.getBoundingClientRect();
  const center = at ?? {
    x: (host?.width ?? 800) / 2,
    y: (host?.height ?? 600) / 2,
  };
  const zoom = Math.min(32, Math.max(0.02, value)),
    ratio = zoom / page.view.zoom;
  studio.camera((p) => {
    p.view = {
      x: center.x - (center.x - p.view.x) * ratio,
      y: center.y - (center.y - p.view.y) * ratio,
      zoom,
    };
  });
}
export function fitPage(page: DesignPage) {
  const host = document.querySelector("[data-stage]")?.getBoundingClientRect();
  if (!host) return;
  const b = exportBounds(page),
    zoom = Math.max(
      0.02,
      Math.min(2, (host.width - 96) / b.width, (host.height - 96) / b.height),
    );
  studio.camera((p) => {
    p.view = {
      zoom,
      x: (host.width - b.width * zoom) / 2 - b.x * zoom,
      y: (host.height - b.height * zoom) / 2 - b.y * zoom,
    };
  });
}
export const Scene = memo(function Scene({
  nodes,
  activate,
  prefix = "canvas",
  editingId = null,
  onCommitText,
  selection,
}: {
  nodes: DesignNode[];
  artworkVersion?: number;
  activate?: (id: string) => void;
  prefix?: string;
  editingId?: string | null;
  onCommitText?: (n: DesignNode, value: string) => void;
  selection?: string[];
}) {
  const selected = new Set(selection);
  const children = new Map<string | null, DesignNode[]>();
  for (const n of nodes) {
    if (!children.has(n.parentId)) children.set(n.parentId, []);
    children.get(n.parentId)!.push(n);
  }
  function draw(n: DesignNode): React.ReactNode {
    if (n.hidden) return null;
    const clip = prefix + "-" + n.id;
    return (
      <g
        key={n.id}
        data-object={n.id}
        onClick={
          activate && n.linkTo
            ? (e) => {
                e.stopPropagation();
                activate(n.linkTo!);
              }
            : undefined
        }
        style={{
          mixBlendMode: n.blend ?? "normal",
          cursor: activate && n.linkTo ? "pointer" : undefined,
        }}
        filter={n.adjustments?.length ? "url(#fx-" + clip + ")" : undefined}
        opacity={container(n) ? n.opacity : undefined}
      >
        {n.adjustments?.length ? (
          <g
            dangerouslySetInnerHTML={{ __html: effectDefs(n, "fx-" + clip) }}
          />
        ) : null}
        {n.kind === "text" && prefix === "canvas" && (
          <rect
            x={n.x}
            y={n.y}
            width={n.width}
            height={n.height}
            fill="transparent"
            transform={
              "rotate(" +
              n.rotation +
              " " +
              (n.x + n.width / 2) +
              " " +
              (n.y + n.height / 2) +
              ")"
            }
          />
        )}
        {n.id === editingId && onCommitText && (
          <InlineText node={n} commit={(value) => onCommitText(n, value)} />
        )}
        {n.kind === "image" && n.image && (
          <image
            transform={nodeTransform(n)}
            href={n.image}
            width={n.width}
            height={n.height}
            preserveAspectRatio="none"
            opacity={n.opacity}
            imageRendering={imageSampling(n)}
          />
        )}
        {n.id !== editingId && n.kind !== "group" && n.kind !== "image" && (
          <g
            dangerouslySetInnerHTML={{
              __html: nodeSVG(
                n.kind === "frame" ? { ...n, opacity: 1 } : n,
                selected.has(n.id),
              ),
            }}
          />
        )}
        {n.kind === "frame" && n.clip && (
          <defs>
            <clipPath id={clip}>
              <rect
                x={n.x}
                y={n.y}
                width={n.width}
                height={n.height}
                rx={n.radius}
              />
            </clipPath>
          </defs>
        )}
        {container(n) && (
          <g
            clipPath={
              n.kind === "frame" && n.clip ? "url(#" + clip + ")" : undefined
            }
          >
            {children.get(n.id)?.map(draw)}
          </g>
        )}
      </g>
    );
  }
  return <>{children.get(null)?.map(draw)}</>;
});
function updatePath(n: DesignNode, points: DesignNode["points"]) {
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  n.x = Math.min(...xs);
  n.y = Math.min(...ys);
  n.width = Math.max(1, Math.max(...xs) - n.x);
  n.height = Math.max(1, Math.max(...ys) - n.y);
  n.points = points.map((p) => ({ ...p, x: p.x - n.x, y: p.y - n.y }));
}
const handles: Record<string, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};
export function Canvas({
  page,
  tool,
  setTool,
  space,
  grid,
}: {
  page: DesignPage;
  tool: Tool;
  setTool: (t: Tool) => void;
  space: boolean;
  grid: boolean;
}) {
  const prefs = usePrefs();
  const lastTextTap = useRef({ id: "", time: 0, x: 0, y: 0 });
  const svg = useRef<SVGSVGElement>(null),
    g = useRef<Gesture | null>(null);
  const [marquee, setMarquee] = useState<Bounds | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const commitText = useCallback((node: DesignNode, value: string) => {
    if (value !== node.text)
      studio.mutate("Изменить текст", () => {
        node.text = value;
        node.textLayout ??= "auto";
        fitText(node);
      });
    setEditing(null);
  }, []);
  const v = page.view,
    selected = studio.selection,
    box = selectionBounds(page.nodes, selected);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (g.current) return;
      const p = studio.page;
      if (!p) return;
      if (event.ctrlKey || event.metaKey) {
        const r = el.getBoundingClientRect();
        zoomAt(p, p.view.zoom * Math.exp(-event.deltaY * 0.008), {
          x: event.clientX - r.left,
          y: event.clientY - r.top,
        });
      } else
        studio.camera((p) => {
          p.view.x -= event.shiftKey ? event.deltaY : event.deltaX;
          p.view.y -= event.shiftKey ? 0 : event.deltaY;
        });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);
  function hit(
    e: ReactPointer<SVGSVGElement> | React.MouseEvent<SVGSVGElement>,
  ) {
    const id = objectAt(svg.current!, e.clientX, e.clientY);
    return page.nodes.find((n) => n.id === id);
  }
  function down(e: ReactPointer<SVGSVGElement>) {
    if (g.current || e.button === 2) return;
    if (editing) {
      if (document.activeElement instanceof HTMLTextAreaElement)
        document.activeElement.blur();
    }
    const client = { x: e.clientX, y: e.clientY },
      start = screenToWorld(client, svg.current!.getBoundingClientRect(), v);
    const base: Gesture = {
      pointerId: e.pointerId,
      type: "pan",
      start,
      client,
      view: { ...v },
      original: [],
      selected: [...selected],
      points: [start],
    };
    svg.current!.setPointerCapture(e.pointerId);
    if (space || tool === "pan" || e.button === 1) {
      g.current = base;
      return;
    }
    const targetNode = hit(e);
    if (tool === "picker") {
      const c =
        targetNode &&
        (targetNode.fill !== "none" ? targetNode.fill : targetNode.stroke);
      if (c && c !== "none") preferences({ [prefs.paintSlot]: c });
      return;
    }
    if (tool === "eraser") {
      studio.begin("Ластик");
      g.current = { ...base, type: "erase" };
      erase(e);
      return;
    }
    if (
      targetNode?.kind === "text" &&
      !inherited(page.nodes, targetNode, "locked") &&
      (tool === "text" ||
        ((tool === "select" || tool === "direct") &&
          lastTextTap.current.id === targetNode.id &&
          performance.now() - lastTextTap.current.time < 480 &&
          Math.hypot(
            e.clientX - lastTextTap.current.x,
            e.clientY - lastTextTap.current.y,
          ) < 6))
    ) {
      e.preventDefault();
      studio.select([targetNode.id]);
      setTool("select");
      g.current = { ...base, type: "edit", id: targetNode.id };
      lastTextTap.current.id = "";
      return;
    }
    lastTextTap.current = {
      id: targetNode?.id ?? "",
      time: performance.now(),
      x: e.clientX,
      y: e.clientY,
    };
    if (tool === "select" || tool === "direct") {
      const handle = (e.target as Element).getAttribute("data-handle");
      if (handle && box) {
        studio.begin("Изменить размер");
        const affected = descendants(page.nodes, selected);
        g.current = {
          ...base,
          type: "resize",
          handle,
          box,
          original: page.nodes
            .filter((n) => affected.has(n.id))
            .map((n) => ({ ...n })),
        };
        return;
      }
      let n = targetNode;
      if (n && inherited(page.nodes, n, "locked")) n = undefined;
      if (
        n?.kind === "frame" &&
        !selected.includes(n.id) &&
        tool === "select" &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        // Drag on the background to select children; a click still selects the frame.
        base.id = n.id;
        n = undefined;
      }
      if (
        n &&
        tool !== "direct" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !selected.includes(n.id)
      ) {
        let parent = page.nodes.find((p) => p.id === n!.parentId);
        while (parent?.kind === "group" && !parent.artLayer) {
          n = parent;
          if (selected.includes(n.id)) break;
          parent = page.nodes.find((p) => p.id === parent!.parentId);
        }
      }
      if (n) {
        const ids = e.shiftKey
          ? toggleObject(page.nodes, selected, n.id)
          : selected.includes(n.id)
            ? selected
            : [n.id];
        studio.select(ids);
        if (!ids.length) return;
        const rootIds = roots(page.nodes, ids);
        const moving: Element[] = [];
        for (const id of rootIds) {
          const object = svg.current!.querySelector(
            '[data-object="' + id + '"]',
          );
          const label = svg.current!.querySelector(
            '[data-frame-label="' + id + '"]',
          );
          if (object) moving.push(object);
          if (label) moving.push(label);
        }
        g.current = {
          ...base,
          type: "move",
          moving,
          box: selectionBounds(page.nodes, ids) ?? undefined,
          selected: ids,
        };
      } else {
        if (!e.shiftKey) studio.select([]);
        g.current = {
          ...base,
          type: "marquee",
          selected: e.shiftKey ? selected : [],
        };
      }
      return;
    }
    if (prefs.snap && tool !== "path") {
      start.x = Math.round(start.x / prefs.gridSize) * prefs.gridSize;
      start.y = Math.round(start.y / prefs.gridSize) * prefs.gridSize;
    }
    const n = newNode(tool, start.x, start.y, 1, 1);
    if (["frame", "rect", "polygon", "ellipse", "text"].includes(tool))
      n.fill = prefs[prefs.paintSlot];
    if (tool === "polygon") n.sides = prefs.sides;
    if (tool === "line" || tool === "arrow" || tool === "path")
      n.stroke = prefs[prefs.paintSlot];
    if (tool === "path") {
      n.strokeWidth = prefs.size;
      n.opacity = prefs.opacity;
      if (e.pointerType === "pen" && prefs.pressure)
        base.points = [
          {
            ...start,
            pressure: pressureFactor(e.pressure, prefs.minimum, prefs.curve),
          },
        ];
    }
    if (tool === "text") n.textLayout = "auto";
    const frame = [...page.nodes]
      .reverse()
      .find(
        (f) =>
          f.kind === "frame" &&
          !inherited(page.nodes, f, "locked") &&
          !inherited(page.nodes, f, "hidden") &&
          contains(bounds(f), start),
      );
    let active = page.nodes.find((o) => o.id === selected[0]);
    while (active && !active.artLayer)
      active = active.parentId
        ? page.nodes.find((o) => o.id === active!.parentId)
        : undefined;
    if (tool !== "frame") {
      if (
        active &&
        !inherited(page.nodes, active, "locked") &&
        !inherited(page.nodes, active, "hidden")
      )
        n.parentId = active.id;
      else if (frame) n.parentId = frame.id;
    }
    if (tool === "text") {
      fitText(n);
    }
    if (tool === "path" || tool === "line" || tool === "arrow")
      n.points = [{ ...base.points[0], x: 0, y: 0 }];
    studio.begin("Создать " + n.name.toLowerCase());
    page.nodes.push(n);
    studio.select([n.id]);
    g.current = { ...base, type: "draw", id: n.id };
  }
  function erase(e: ReactPointer<SVGSVGElement>) {
    const n = hit(e);
    if (n && !container(n) && !inherited(page.nodes, n, "locked")) {
      removeNodes(studio.document!, page, [n.id]);
      studio.select([]);
      studio.emit();
    }
  }
  function move(e: ReactPointer<SVGSVGElement>) {
    const a = g.current;
    if (!a || a.pointerId !== e.pointerId) return;
    if (a.type === "edit") return;
    if (a.type === "erase") {
      erase(e);
      return;
    }
    const client = { x: e.clientX, y: e.clientY };
    const at = screenToWorld(
      client,
      svg.current!.getBoundingClientRect(),
      a.view,
    );
    if (prefs.snap && a.type === "draw" && tool !== "path") {
      at.x = Math.round(at.x / prefs.gridSize) * prefs.gridSize;
      at.y = Math.round(at.y / prefs.gridSize) * prefs.gridSize;
    }
    let dx = at.x - a.start.x,
      dy = at.y - a.start.y;
    if (a.type === "pan") {
      studio.camera((p) => {
        p.view.x = a.view.x + client.x - a.client.x;
        p.view.y = a.view.y + client.y - a.client.y;
      });
      return;
    }
    if (a.type === "marquee") {
      setMarquee(boxBetween(a.start, at));
      return;
    }
    if (a.type === "move") {
      previewTranslation(a, dx, dy, e.shiftKey);
      return;
    }
    if (a.type === "resize") {
      const originals = new Map(a.original.map((n) => [n.id, n]));
      for (const n of page.nodes) {
        const original = originals.get(n.id);
        if (original) Object.assign(n, original);
      }
      const b = a.box!,
        h = a.handle!;
      const left = h.includes("w")
        ? Math.min(b.x + dx, b.x + b.width - 1)
        : b.x;
      const top = h.includes("n")
        ? Math.min(b.y + dy, b.y + b.height - 1)
        : b.y;
      const right = h.includes("e")
        ? Math.max(b.x + b.width + dx, b.x + 1)
        : b.x + b.width;
      const bottom = h.includes("s")
        ? Math.max(b.y + b.height + dy, b.y + 1)
        : b.y + b.height;
      const target = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      };
      const single =
        a.selected.length === 1
          ? page.nodes.find((n) => n.id === a.selected[0])
          : null;
      if (e.shiftKey) Object.assign(target, proportionalResize(b, target, h));
      if (single?.kind === "frame") Object.assign(single, target);
      else {
        resizeNodes(page.nodes, a.selected, b, target);
      }
    } else {
      const n = page.nodes.find((n) => n.id === a.id)!;
      if (n.kind === "path") {
        const batch = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const rect = svg.current!.getBoundingClientRect();
        for (const sample of batch.length ? batch : [e.nativeEvent]) {
          if (a.points.length >= 20000) break;
          const p = screenToWorld(
              { x: sample.clientX, y: sample.clientY },
              rect,
              a.view,
            ),
            prev = a.points.at(-1)!;
          if (Math.hypot(p.x - prev.x, p.y - prev.y) < 0.25 / v.zoom) continue;
          a.points.push({
            x: p.x * (1 - prefs.smoothing) + prev.x * prefs.smoothing,
            y: p.y * (1 - prefs.smoothing) + prev.y * prefs.smoothing,
            pressure:
              sample.pointerType === "pen" && prefs.pressure
                ? pressureFactor(sample.pressure, prefs.minimum, prefs.curve)
                : undefined,
          });
        }
        updatePath(n, a.points);
      } else if (n.kind === "line" || n.kind === "arrow")
        updatePath(n, [a.start, at]);
      else if (n.kind !== "text") {
        if (e.shiftKey) {
          const size = Math.max(Math.abs(dx), Math.abs(dy));
          at.x = a.start.x + Math.sign(dx || 1) * size;
          at.y = a.start.y + Math.sign(dy || 1) * size;
        }
        Object.assign(n, boxBetween(a.start, at));
      }
    }
    studio.emit();
  }
  function previewTranslation(
    a: Gesture,
    dx: number,
    dy: number,
    shift: boolean,
  ) {
    if (shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (prefs.snap && a.box) {
      dx =
        Math.round((a.box.x + dx) / prefs.gridSize) * prefs.gridSize - a.box.x;
      dy =
        Math.round((a.box.y + dy) / prefs.gridSize) * prefs.gridSize - a.box.y;
    }
    a.delta = { x: dx, y: dy };
    const transform = "translate(" + dx + " " + dy + ")";
    for (const element of a.moving!)
      element.setAttribute("transform", transform);
    svg.current
      ?.querySelector(".selection")
      ?.setAttribute("transform", transform);
  }
  function up(e: ReactPointer<SVGSVGElement>) {
    const a = g.current;
    if (!a || a.pointerId !== e.pointerId) return;
    if (a.type === "resize" && e.type === "pointerup") move(e);
    if (a.type === "edit") {
      g.current = null;
      if (svg.current?.hasPointerCapture(e.pointerId))
        svg.current.releasePointerCapture(e.pointerId);
      setEditing(a.id!);
      return;
    }
    if (a.type === "marquee") {
      const at = screenToWorld(
          { x: e.clientX, y: e.clientY },
          svg.current!.getBoundingClientRect(),
          v,
        ),
        b = boxBetween(a.start, at);
      if (e.type !== "pointercancel") {
        const end = { x: e.clientX, y: e.clientY };
        const dragged = Math.hypot(end.x - a.client.x, end.y - a.client.y) > 3;
        const ids = dragged
          ? marqueeObjects(
              svg.current!,
              page.nodes,
              a.client,
              end,
              b,
              tool === "direct" || e.ctrlKey || e.metaKey,
            )
          : a.id
            ? [a.id]
            : [];
        studio.select(roots(page.nodes, [...new Set([...a.selected, ...ids])]));
      }
      setMarquee(null);
    } else if (a.type === "move") {
      if (
        e.type !== "pointercancel" &&
        (a.delta || e.clientX !== a.client.x || e.clientY !== a.client.y)
      )
        previewTranslation(
          a,
          (e.clientX - a.client.x) / a.view.zoom,
          (e.clientY - a.client.y) / a.view.zoom,
          e.shiftKey,
        );
      for (const element of a.moving!) element.removeAttribute("transform");
      svg.current?.querySelector(".selection")?.removeAttribute("transform");
      if (a.delta && e.type !== "pointercancel")
        studio.translate(page, a.selected, a.delta.x, a.delta.y);
    } else if (a.type === "pan") {
      const x = a.view.x + e.clientX - a.client.x,
        y = a.view.y + e.clientY - a.client.y;
      if (e.type !== "pointercancel" && (v.x !== x || v.y !== y))
        studio.camera((p) => {
          p.view.x = x;
          p.view.y = y;
        });
    } else {
      if (a.type === "draw") {
        const n = page.nodes.find((n) => n.id === a.id)!;
        if (n.width < 3 && n.height < 3) {
          if (["line", "arrow"].includes(n.kind))
            updatePath(n, [a.start, { x: a.start.x + 120, y: a.start.y }]);
          else if (n.kind === "path" && a.points.length === 1)
            updatePath(n, [
              a.points[0],
              { ...a.points[0], x: a.start.x + 0.01 },
            ]);
          else if (n.kind === "path") updatePath(n, a.points);
          else {
            n.width = n.kind === "frame" ? 400 : 120;
            n.height = n.kind === "frame" ? 300 : 100;
          }
        }
        if (n.kind === "text") setEditing(n.id);
        if (n.kind !== "path") setTool("select");
      }
      studio.finish();
    }
    g.current = null;
    if (svg.current?.hasPointerCapture(e.pointerId))
      svg.current.releasePointerCapture(e.pointerId);
  }
  return (
    <main className="stage" data-stage>
      {prefs.wallpaper && (
        <div
          className="wallpaper"
          style={{
            backgroundImage: "url(" + prefs.wallpaper + ")",
            opacity: prefs.wallpaperOpacity,
          }}
        />
      )}
      <svg
        ref={svg}
        className={"surface tool-" + (space ? "pan" : tool)}
        aria-label="Холст"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onDoubleClick={(e) => {
          const n = hit(e);
          if (n?.kind === "text" && !inherited(page.nodes, n, "locked"))
            setEditing(n.id);
        }}
      >
        {grid && (
          <defs>
            <pattern
              id="dots"
              width={Math.max(6, prefs.gridSize * v.zoom)}
              height={Math.max(6, prefs.gridSize * v.zoom)}
              x={v.x}
              y={v.y}
              patternUnits="userSpaceOnUse"
            >
              <circle r="1" fill="#aaaab2" />
            </pattern>
          </defs>
        )}
        {grid && (
          <rect
            width="100%"
            height="100%"
            fill="url(#dots)"
            pointerEvents="none"
          />
        )}
        <g
          transform={"translate(" + v.x + " " + v.y + ") scale(" + v.zoom + ")"}
        >
          {page.nodes
            .filter((n) => n.kind === "frame" && !n.hidden && !n.parentId)
            .map((n) => (
              <text
                key={n.id}
                data-frame-label={n.id}
                x={n.x}
                y={n.y - 8 / v.zoom}
                fontSize={11 / v.zoom}
                fill="#63646a"
                pointerEvents="none"
              >
                {n.name}
              </text>
            ))}
          <Scene
            nodes={page.nodes}
            editingId={editing}
            selection={selected}
            artworkVersion={studio.artworkVersion}
            onCommitText={commitText}
          />
          {box && !editing && (
            <g className="selection">
              <rect
                {...box}
                fill="none"
                stroke="#0d99ff"
                strokeWidth={1.4 / v.zoom}
                pointerEvents="none"
              />
              {Object.entries(handles).map(([h, [x, y]]) => (
                <rect
                  key={h}
                  data-handle={h}
                  x={box.x + x * box.width - 3.5 / v.zoom}
                  y={box.y + y * box.height - 3.5 / v.zoom}
                  width={7 / v.zoom}
                  height={7 / v.zoom}
                  fill="white"
                  stroke="#0d99ff"
                  strokeWidth={1 / v.zoom}
                  style={{ cursor: h + "-resize" }}
                />
              ))}
            </g>
          )}
          {marquee && (
            <rect
              {...marquee}
              stroke="#0d99ff"
              strokeWidth={1 / v.zoom}
              fill="#0d99ff"
              fillOpacity=".12"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>
    </main>
  );
}
