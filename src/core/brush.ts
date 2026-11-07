import type { DesignNode } from "../../shared/model";
export const pressureFactor = (
  pressure: number,
  minPercent: number,
  curve: number,
) =>
  minPercent / 100 +
  (1 - minPercent / 100) * Math.max(0, Math.min(1, pressure)) ** curve;
export function brushOutline(points: DesignNode["points"], width: number) {
  if (!points.length) return "";
  const left: string[] = [],
    right: string[] = [];
  const fmt = (v: number) => Number(v.toFixed(3));
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      a = points[Math.max(0, i - 1)],
      b = points[Math.min(points.length - 1, i + 1)];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy) || 1,
      r = Math.max(0.025, (width * (p.pressure ?? 1)) / 2);
    const nx = (-dy / len) * r,
      ny = (dx / len) * r;
    left.push(fmt(p.x + nx) + " " + fmt(p.y + ny));
    right.push(fmt(p.x - nx) + " " + fmt(p.y - ny));
  }
  return "M " + left.join(" L ") + " L " + right.reverse().join(" L ") + " Z";
}
