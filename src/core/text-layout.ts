import type { DesignNode } from "../../shared/model";
let ctx: CanvasRenderingContext2D | null = null;
function font(n: DesignNode) {
  return (
    n.fontWeight + " " + n.fontSize + "px " + n.fontFamily + ", sans-serif"
  );
}
export function nativeBaseline(n: DesignNode) {
  if (typeof document === "undefined") return n.fontSize;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return n.fontSize;
  ctx.font = font(n);
  const metrics = ctx.measureText("Hg");
  return (
    (n.fontSize * 1.3 +
      metrics.fontBoundingBoxAscent -
      metrics.fontBoundingBoxDescent) /
    2
  );
}
function measure(n: DesignNode, s: string) {
  if (typeof document === "undefined") return s.length * n.fontSize * 0.55;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return s.length * n.fontSize * 0.55;
  ctx.font = font(n);
  return ctx.measureText(s).width;
}
// Use the same line-breaking engine as the input, including whitespace and long words.
let mirror: HTMLDivElement | undefined;
const lineCache = new WeakMap<
  DesignNode,
  { text: string; width: number; scale: number; font: string; lines: string[] }
>();
function browserLines(n: DesignNode, paragraphs: string[]) {
  const cached = lineCache.get(n),
    face = font(n);
  if (
    cached &&
    cached.text === n.text &&
    cached.width === n.width &&
    cached.scale === (n.textScaleX ?? 1) &&
    cached.font === face
  )
    return cached.lines;
  if (!mirror) {
    mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    mirror.style.cssText =
      "position:fixed;left:-1000000px;top:0;visibility:hidden;pointer-events:none;contain:layout style;white-space:pre-wrap;overflow-wrap:break-word;tab-size:8;margin:0;padding:0;border:0";
    document.body.appendChild(mirror);
  }
  mirror.style.font = face;
  mirror.style.lineHeight = n.fontSize * 1.3 + "px";
  mirror.style.width = n.width / (n.textScaleX ?? 1) + "px";
  const lines: string[] = [];
  const range = document.createRange();
  for (const paragraph of paragraphs) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    const text = document.createTextNode(paragraph);
    mirror.replaceChildren(text);
    if (mirror.offsetHeight <= Math.ceil(n.fontSize * 1.3)) {
      lines.push(paragraph);
      continue;
    }
    const row = (i: number) => {
      range.setStart(text, i);
      range.setEnd(text, i + 1);
      return range.getBoundingClientRect().top;
    };
    let start = 0;
    while (start < paragraph.length) {
      const top = row(start);
      let on = start,
        off = start + 1,
        step = 1;
      while (off < paragraph.length && Math.abs(row(off) - top) < 1) {
        on = off;
        step *= 2;
        off = Math.min(paragraph.length, off + step);
      }
      while (off - on > 1) {
        const mid = Math.floor((on + off) / 2);
        if (Math.abs(row(mid) - top) < 1) on = mid;
        else off = mid;
      }
      lines.push(paragraph.slice(start, off));
      start = off;
    }
  }
  mirror.replaceChildren();
  lineCache.set(n, {
    text: n.text,
    width: n.width,
    scale: n.textScaleX ?? 1,
    font: face,
    lines,
  });
  return lines;
}
export function textLines(n: DesignNode) {
  const paragraphs = n.text.split("\n");
  if (n.textLayout !== "wrap") return paragraphs;
  if (typeof document !== "undefined" && document.body)
    return browserLines(n, paragraphs);
  const result: string[] = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
      if (
        line &&
        measure(n, line + word.trimEnd()) * (n.textScaleX ?? 1) > n.width
      ) {
        result.push(line.trimEnd());
        line = "";
      }
      if (measure(n, word.trimEnd()) * (n.textScaleX ?? 1) <= n.width) {
        line += word;
        continue;
      }
      for (const ch of word) {
        if (line && measure(n, line + ch) * (n.textScaleX ?? 1) > n.width) {
          result.push(line);
          line = "";
        }
        line += ch;
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}
export function fitText(n: DesignNode) {
  if (n.kind !== "text") return;
  if (n.textLayout === "auto")
    n.width = Math.min(
      100000,
      Math.max(
        4,
        ...n.text
          .split("\n")
          .map((s) => (measure(n, s) + 2) * (n.textScaleX ?? 1)),
      ),
    );
  n.height = Math.min(
    100000,
    Math.max(n.fontSize * 1.3, textLines(n).length * n.fontSize * 1.3),
  );
}
