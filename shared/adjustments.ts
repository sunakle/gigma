export const adjustmentKinds = [
  "brightness",
  "levels",
  "curves",
  "exposure",
  "vibrance",
  "hue",
  "balance",
  "mono",
  "photo",
  "mixer",
  "lookup",
  "invert",
  "poster",
  "threshold",
  "gradient",
  "selective",
] as const;
export type AdjustmentKind = (typeof adjustmentKinds)[number];
export const adjustmentNames: Record<AdjustmentKind, string> = {
  brightness: "Яркость",
  levels: "Уровни",
  curves: "Кривая гаммы",
  exposure: "Экспозиция",
  vibrance: "Сочность",
  hue: "Цветовой тон",
  balance: "Баланс цвета",
  mono: "Чёрно-белое",
  photo: "Фотофильтр",
  mixer: "Микшер каналов",
  lookup: "Тонирование",
  invert: "Инверсия",
  poster: "Постеризация",
  threshold: "Порог",
  gradient: "Карта градиента",
  selective: "Выборочная коррекция",
};
export type Adjustment = {
  kind: AdjustmentKind;
  amount: number;
  contrast?: number;
  low?: string;
  high?: string;
};
// SVG primitives work on embedded photographs and vector artwork alike.
export function adjustmentMarkup({
  kind,
  amount,
  contrast = 0,
  low,
  high,
}: Adjustment) {
  const t = amount / 100;
  const matrix = (rows: number[]) =>
    '<feColorMatrix type="matrix" values="' +
    [...rows, 0, 0, 0, 1, 0].join(" ") +
    '"/>';
  const transfer = (fn: (v: number, c: number) => number) =>
    "<feComponentTransfer>" +
    ["R", "G", "B"]
      .map(
        (c, i) =>
          "<feFunc" +
          c +
          ' type="table" tableValues="' +
          Array.from({ length: 256 }, (_, j) =>
            Math.min(1, Math.max(0, fn(j / 255, i))).toFixed(4),
          ).join(" ") +
          '"/>',
      )
      .join("") +
    "</feComponentTransfer>";
  const sat = (s: number) =>
    '<feColorMatrix type="saturate" values="' + s + '"/>';
  switch (kind) {
    case "brightness":
      return transfer((v) => (v - 0.5) * 2 ** (contrast / 50) + 0.5 + t * 0.5);
    case "levels":
      return transfer((v) => (v - 0.2 * t) / (1 - 0.4 * Math.abs(t)));
    case "curves":
      return transfer((v) => v ** (2 ** (-t * 2)));
    case "exposure":
      return transfer((v) => v * 2 ** (t * 3));
    case "vibrance":
      return sat(1 + t);
    case "hue":
      return '<feColorMatrix type="hueRotate" values="' + 180 * t + '"/>';
    case "balance":
      return transfer(
        (v, c) => v + [0.25, 0, -0.25][c] * t * Math.sin(v * Math.PI),
      );
    case "mono":
      return sat(1 - Math.abs(t));
    case "photo":
      return transfer((v, c) => v * (1 - [0, 0.15, 0.35][c] * t));
    case "mixer":
      return matrix([1 - t, t, 0, 0, 0, 0, 1 - t, t, 0, 0, t, 0, 1 - t, 0, 0]);
    case "lookup":
      return transfer(
        (v, c) => v + (c === 2 ? 0.09 : -0.04) * t * (1 - v) - 0.06 * t * v,
      );
    case "invert":
      return transfer((v) => v + (1 - 2 * v) * Math.abs(t));
    case "poster": {
      const steps = 2 + Math.round((1 - Math.abs(t)) * 30);
      return transfer((v) => Math.round(v * steps) / steps);
    }
    case "threshold":
      return sat(0) + transfer((v) => (v >= (t + 1) / 2 ? 1 : 0));
    case "gradient": {
      const channels = (value: string | undefined, fallback: string) =>
        [1, 3, 5].map(
          (i) =>
            parseInt(
              (value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback).slice(
                i,
                i + 2,
              ),
              16,
            ) / 255,
        );
      const a = channels(low, "#211134"),
        b = channels(high, "#ffcf97");
      return (
        sat(0) +
        transfer((v, c) => {
          const k = v ** (2 ** -t);
          return a[c] * (1 - k) + b[c] * k;
        })
      );
    }
    case "selective":
      return matrix([
        1 + 0.3 * t,
        -0.15 * t,
        -0.15 * t,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
      ]);
  }
}
