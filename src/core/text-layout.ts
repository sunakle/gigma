import type { DesignNode } from "../../shared/model";
let ctx: CanvasRenderingContext2D | null = null;
function measure(n: DesignNode, s: string) {
  if (typeof document === "undefined") return s.length * n.fontSize * 0.55;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return s.length * n.fontSize * 0.55;
  ctx.font =
    n.fontWeight + " " + n.fontSize + "px " + n.fontFamily + ", sans-serif";
  return ctx.measureText(s).width;
}
export function textLines(n: DesignNode) {
  const paragraphs = n.text.split("\n");
  if (n.textLayout !== "wrap") return paragraphs;
  const result: string[] = [];
  for (const paragraph of paragraphs) {
    let line = "";
    for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
      if (line && measure(n, line + word.trimEnd()) > n.width) {
        result.push(line.trimEnd());
        line = "";
      }
      if (measure(n, word.trimEnd()) <= n.width) {
        line += word;
        continue;
      }
      for (const ch of word) {
        if (line && measure(n, line + ch) > n.width) {
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
      Math.max(4, ...n.text.split("\n").map((s) => measure(n, s) + 2)),
    );
  n.height = Math.min(
    100000,
    Math.max(n.fontSize * 1.3, textLines(n).length * n.fontSize * 1.3),
  );
}
