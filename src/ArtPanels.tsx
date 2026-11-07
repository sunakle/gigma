import { useState } from "react";
import {
  ArrowLeftRight,
  Sun,
  ChartNoAxesColumn,
  ChartSpline,
  Aperture,
  Flower2,
  Rainbow,
  Scale,
  Contrast,
  Thermometer,
  SlidersHorizontal,
  Grid3X3,
  FlipHorizontal2,
  Layers3,
  ScanLine,
  Blend,
  Palette,
  Trash2,
} from "lucide-react";
import type { DesignNode } from "../shared/model";
import { adjustmentNames, adjustmentKinds } from "../shared/adjustments";
import { preferences, usePrefs } from "./core/preferences";
import { forestColors, Range } from "./Settings";
import { studio } from "./core/studio";
const icons = [
  Sun,
  ChartNoAxesColumn,
  ChartSpline,
  Aperture,
  Flower2,
  Rainbow,
  Scale,
  Contrast,
  Thermometer,
  SlidersHorizontal,
  Grid3X3,
  FlipHorizontal2,
  Layers3,
  ScanLine,
  Blend,
  Palette,
];
function hsv(hex: string) {
  const [r, g, b] = [1, 3, 5].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const v = Math.max(r, g, b),
    d = v - Math.min(r, g, b);
  return {
    h: !d
      ? 0
      : ((v === r ? (g - b) / d : v === g ? 2 + (b - r) / d : 4 + (r - g) / d) *
          60 +
          360) %
        360,
    s: v ? d / v : 0,
    v,
  };
}
function rgb(h: number, s: number, v: number) {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1))))
      .toString(16)
      .padStart(2, "0");
  };
  return "#" + channel(5) + channel(3) + channel(1);
}
export function ColorPanel({ nodes }: { nodes: DesignNode[] }) {
  const p = usePrefs(),
    [background, setBackground] = useState(false),
    [lastHue, setHue] = useState(0),
    [dragColor, setDragColor] = useState<string | null>(null);
  const color = dragColor ?? (background ? p.background : p.foreground),
    { h, s, v } = hsv(color),
    hue = s > 0 ? h : lastHue;
  function choose(value: string) {
    preferences(background ? { background: value } : { foreground: value });
    if (!background && nodes.length)
      studio.mutate("Цвет слоя", () => {
        for (const n of nodes) {
          if (["path", "arrow", "line"].includes(n.kind)) n.stroke = value;
          else if (!["image", "group"].includes(n.kind)) n.fill = value;
        }
      });
  }
  function pick(e: React.PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return rgb(
      hue,
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    );
  }
  return (
    <details className="art-section" open>
      <summary>Цвет</summary>
      <div className="spectrum-row">
        <div className="chips">
          <button
            title="Основной цвет"
            aria-pressed={!background}
            style={{ background: p.foreground }}
            onClick={() => setBackground(false)}
          />
          <button
            title="Фоновый цвет кадра"
            aria-pressed={background}
            style={{ background: p.background }}
            onClick={() => setBackground(true)}
          />
          <button
            title="Поменять цвета местами"
            onClick={() =>
              preferences({
                foreground: p.background,
                background: p.foreground,
              })
            }
          >
            <ArrowLeftRight />
          </button>
        </div>
        <div
          className="spectrum"
          style={{ backgroundColor: "hsl(" + hue + " 100% 50%)" }}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragColor(pick(e));
          }}
          onPointerMove={(e) => {
            if (e.buttons === 1) setDragColor(pick(e));
          }}
          onPointerUp={(e) => {
            choose(pick(e));
            setDragColor(null);
          }}
          onPointerCancel={() => setDragColor(null)}
        >
          <i style={{ left: s * 100 + "%", top: (1 - v) * 100 + "%" }} />
        </div>
        <input
          className="hue"
          type="range"
          min="0"
          max="359"
          aria-label="Тон палитры"
          value={Math.round(hue)}
          onChange={(e) => {
            setHue(e.target.valueAsNumber);
            choose(rgb(e.target.valueAsNumber, s || 1, v || 1));
          }}
        />
      </div>
      <label className="color-value">
        <input
          type="color"
          aria-label={background ? "Цвет фона кадра" : "Цвет рисования"}
          value={color}
          onChange={(e) => choose(e.target.value)}
        />
        {color.toUpperCase()}
      </label>
      {[
        ...(p.forest
          ? [{ name: "Лесная мастерская", colors: forestColors }]
          : []),
        ...p.palettes,
      ].map((a) => (
        <div key={a.name} className="swatches" aria-label={a.name}>
          {a.colors.map((c, i) => (
            <button
              key={i}
              style={{ background: c }}
              title={a.name + " " + c}
              onClick={() => choose(c)}
            />
          ))}
        </div>
      ))}
    </details>
  );
}
export function Adjustments({ nodes }: { nodes: DesignNode[] }) {
  const n = nodes[0],
    p = usePrefs();
  return (
    <details className="art-section" open>
      <summary>Коррекции</summary>
      <div className="adjust-grid">
        {adjustmentKinds.map((kind, i) => {
          const Icon = icons[i];
          return (
            <button
              key={kind}
              title={adjustmentNames[kind]}
              aria-label={"Добавить коррекцию " + adjustmentNames[kind]}
              disabled={
                !n || nodes.some((n) => (n.adjustments?.length ?? 0) >= 16)
              }
              onClick={() =>
                studio.mutate("Добавить коррекцию", () => {
                  for (const o of nodes)
                    (o.adjustments ??= []).push({
                      kind,
                      ...(kind === "gradient"
                        ? { low: p.foreground, high: p.background }
                        : {}),
                      amount:
                        kind === "invert" || kind === "mono"
                          ? 100
                          : kind === "threshold"
                            ? 0
                            : 35,
                    });
                })
              }
            >
              <Icon />
            </button>
          );
        })}
      </div>
      {nodes.length === 1 &&
        n.adjustments?.map((a, i) => (
          <div className="adjust-value" key={i}>
            <Range
              name={adjustmentNames[a.kind]}
              min={-100}
              value={a.amount}
              onChange={(amount) =>
                studio.mutate("Настроить коррекцию", () => {
                  a.amount = amount;
                })
              }
            />
            {a.kind === "brightness" && (
              <Range
                name="Контраст"
                min={-100}
                value={a.contrast ?? 0}
                onChange={(v) =>
                  studio.mutate("Контраст", () => {
                    a.contrast = v;
                  })
                }
              />
            )}
            {a.kind === "gradient" && (
              <div className="gradient-ends">
                {(["low", "high"] as const).map((k, index) => (
                  <input
                    key={k}
                    type="color"
                    aria-label={index ? "Цвет света" : "Цвет тени"}
                    value={a[k] ?? (index ? "#ffcf97" : "#211134")}
                    onChange={(e) =>
                      studio.mutate("Карта градиента", () => {
                        a[k] = e.target.value;
                      })
                    }
                  />
                ))}
              </div>
            )}
            <button
              title="Удалить коррекцию"
              onClick={() =>
                studio.mutate("Удалить коррекцию", () => {
                  n.adjustments!.splice(i, 1);
                })
              }
            >
              <Trash2 />
            </button>
          </div>
        ))}
    </details>
  );
}
export function LayerControls({ nodes }: { nodes: DesignNode[] }) {
  const n = nodes[0];
  if (!n) return null;
  function set(p: Partial<DesignNode>) {
    studio.mutate("Свойства слоя", () => {
      for (const o of nodes) Object.assign(o, p);
    });
  }
  return (
    <div className="layer-controls">
      <select
        aria-label="Режим наложения"
        value={n.blend ?? "normal"}
        onChange={(e) => set({ blend: e.target.value as DesignNode["blend"] })}
      >
        {Object.entries({
          normal: "Обычный",
          multiply: "Умножение",
          screen: "Экран",
          overlay: "Перекрытие",
          darken: "Затемнение",
          lighten: "Осветление",
          difference: "Разница",
          "soft-light": "Мягкий свет",
        }).map(([v, name]) => (
          <option key={v} value={v}>
            {name}
          </option>
        ))}
      </select>
      <Range
        name="Непрозрачность слоя, %"
        value={n.opacity * 100}
        onChange={(v) => set({ opacity: v / 100 })}
      />
      <Range
        name="Заливка слоя, %"
        value={(n.fillOpacity ?? 1) * 100}
        onChange={(v) => set({ fillOpacity: v / 100 })}
      />
    </div>
  );
}
