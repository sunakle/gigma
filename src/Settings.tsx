import { useRef, useState } from "react";
import { X, Upload, Trash2, SlidersHorizontal, Puzzle } from "lucide-react";
import {
  preferences,
  usePrefs,
  paletteSchema,
  setWallpaper,
} from "./core/preferences";
export const forestColors = [
  "#26352c",
  "#40533c",
  "#819269",
  "#b7ba87",
  "#b7845c",
  "#686076",
  "#799ea4",
  "#e5cfa6",
];
export function Range({
  name,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
}: {
  name: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="range-row">
      <span>
        {name}
        <output>{Number(value.toFixed(2))}</output>
      </span>
      <input
        type="range"
        aria-label={name}
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.valueAsNumber)}
      />
    </label>
  );
}
export function BrushPanel() {
  const p = usePrefs(),
    [signal, setSignal] = useState("Коснитесь пером");
  return (
    <section>
      <h3>Кисть</h3>
      <div className="preset-row">
        {[
          ["Перо", 3, 1, 0.08],
          ["Маркер", 22, 0.55, 0.22],
          ["Тушь", 11, 1, 0.35],
        ].map(([name, size, opacity, smoothing]) => (
          <button
            key={name}
            onClick={() =>
              preferences({
                size: Number(size),
                opacity: Number(opacity),
                smoothing: Number(smoothing),
              })
            }
          >
            {name}
          </button>
        ))}
      </div>
      <Range
        name="Диаметр, px"
        min={0.5}
        max={200}
        step={0.5}
        value={p.size}
        onChange={(size) => preferences({ size })}
      />
      <Range
        name="Непрозрачность кисти, %"
        min={1}
        value={p.opacity * 100}
        onChange={(v) => preferences({ opacity: v / 100 })}
      />
      <Range
        name="Сглаживание, %"
        max={90}
        value={p.smoothing * 100}
        onChange={(v) => preferences({ smoothing: v / 100 })}
      />
      <label className="check">
        <input
          type="checkbox"
          checked={p.pressure}
          onChange={(e) => preferences({ pressure: e.target.checked })}
        />
        Толщина от нажима пера
      </label>
      {p.pressure && (
        <>
          <Range
            name="Минимальная толщина, %"
            min={1}
            value={p.minimum}
            onChange={(minimum) => preferences({ minimum })}
          />
          <Range
            name="Кривая нажима"
            min={0.25}
            max={3}
            step={0.05}
            value={p.curve}
            onChange={(curve) => preferences({ curve })}
          />
        </>
      )}
      <div
        className="pen-pad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setSignal(
            e.pointerType === "pen"
              ? "Перо · " + Math.round(100 * e.pressure) + "%"
              : "Мышь / касание",
          );
        }}
        onPointerMove={(e) => {
          if (e.buttons && e.pointerType === "pen")
            setSignal("Перо · " + Math.round(100 * e.pressure) + "%");
        }}
      >
        {signal}
      </div>
    </section>
  );
}
export function Settings({
  initial,
  close,
  report,
}: {
  initial: "settings" | "plugins";
  close: () => void;
  report: (e: unknown) => void;
}) {
  const p = usePrefs(),
    [tab, setTab] = useState(initial),
    image = useRef<HTMLInputElement>(null),
    extension = useRef<HTMLInputElement>(null);
  async function install(f: File) {
    if (f.size > 16000)
      throw Error("Расширение палитры должно быть меньше 16 КБ.");
    const data = paletteSchema.safeParse(JSON.parse(await f.text()));
    if (!data.success)
      throw Error(
        "Нужен JSON с type: gigma.palette, названием name и массивом HEX-цветов colors.",
      );
    preferences({
      palettes: [
        ...p.palettes.filter((x) => x.name !== data.data.name),
        data.data,
      ],
    });
  }
  return (
    <div className="veil">
      <div
        className="dialog settings-dialog"
        role="dialog"
        aria-label="Параметры Gigma"
      >
        <div className="dialog-head">
          <h2>Параметры Gigma</h2>
          <button title="Закрыть" onClick={close}>
            <X />
          </button>
        </div>
        <nav className="settings-nav">
          <button
            aria-pressed={tab === "settings"}
            onClick={() => setTab("settings")}
          >
            <SlidersHorizontal />
            Рабочая среда
          </button>
          <button
            aria-pressed={tab === "plugins"}
            onClick={() => setTab("plugins")}
          >
            <Puzzle />
            Расширения
          </button>
        </nav>
        {tab === "settings" ? (
          <>
            <label className="stack">
              Тема
              <select
                value={p.theme}
                onChange={(e) =>
                  preferences({ theme: e.target.value as typeof p.theme })
                }
              >
                <option value="dark">Тёмная</option>
                <option value="light">Светлая</option>
              </select>
            </label>
            <h3>Обои холста</h3>
            <div className="preset-row">
              <button onClick={() => image.current?.click()}>
                <Upload />
                Выбрать изображение
              </button>
              {p.wallpaper && (
                <button
                  title="Убрать обои"
                  onClick={() => preferences({ wallpaper: "" })}
                >
                  <Trash2 />
                </button>
              )}
            </div>
            {p.wallpaper && (
              <Range
                name="Видимость обоев, %"
                value={p.wallpaperOpacity * 100}
                onChange={(v) => preferences({ wallpaperOpacity: v / 100 })}
              />
            )}
            <input
              ref={image}
              type="file"
              aria-label="Файл обоев"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void setWallpaper(f).catch(report);
              }}
            />
            <Range
              name="Шаг сетки, px"
              min={2}
              max={128}
              value={p.gridSize}
              onChange={(gridSize) => preferences({ gridSize })}
            />
            <label className="check">
              <input
                type="checkbox"
                checked={p.snap}
                onChange={(e) => preferences({ snap: e.target.checked })}
              />
              Привязывать фигуры и перемещение к сетке
            </label>
            <Range
              name="Сдвиг стрелками, px"
              min={1}
              max={50}
              value={p.nudge}
              onChange={(nudge) => preferences({ nudge })}
            />
            <Range
              name="Стороны многоугольника"
              min={3}
              max={32}
              value={p.sides}
              onChange={(sides) => preferences({ sides })}
            />
          </>
        ) : (
          <>
            <h3>Расширения палитры</h3>
            <label className="plugin-card">
              <span>
                <b>Лесная мастерская</b>
                <small>8 цветов для природных материалов</small>
              </span>
              <input
                type="checkbox"
                checked={p.forest}
                onChange={(e) => preferences({ forest: e.target.checked })}
              />
            </label>
            {p.palettes.map((a) => (
              <div className="plugin-card" key={a.name}>
                <span>
                  {a.name}
                  <small>Цветов · {a.colors.length}</small>
                </span>
                <button
                  title={"Удалить " + a.name}
                  onClick={() =>
                    preferences({
                      palettes: p.palettes.filter((x) => x.name !== a.name),
                    })
                  }
                >
                  <Trash2 />
                </button>
              </div>
            ))}
            <button
              className="secondary"
              onClick={() => extension.current?.click()}
            >
              <Upload />
              Установить палитру из JSON
            </button>
            <input
              hidden
              ref={extension}
              type="file"
              aria-label="Расширение палитры"
              accept=".json"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void install(f).catch(report);
              }}
            />
            <details>
              <summary>Формат расширения</summary>
              <pre>
                {JSON.stringify(
                  {
                    type: "gigma.palette",
                    name: "Сумерки",
                    colors: ["#9683c6", "#222336"],
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
