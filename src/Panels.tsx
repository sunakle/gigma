import { useState } from "react";
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Circle,
  Diamond,
  Eye,
  EyeOff,
  File,
  Frame,
  Group,
  Image,
  Layers,
  LockKeyhole,
  Minus,
  MousePointer2,
  Pencil,
  Plus,
  Square,
  Type,
  UnlockKeyhole,
} from "lucide-react";
import { newPage, type DesignNode, type DesignPage } from "../shared/model";
import {
  alignNodes,
  autoLayout,
  container,
  inherited,
  moveNodes,
  resizeNodes,
  selectionBounds,
} from "./core/geometry";
import { studio } from "./core/studio";
const icons = {
  frame: Frame,
  rect: Square,
  ellipse: Circle,
  line: Minus,
  arrow: ArrowUp,
  path: Pencil,
  text: Type,
  image: Image,
  group: Group,
};
export function Field({
  label,
  value,
  commit,
  type = "text",
  min,
  max,
}: {
  label: string;
  value: string | number;
  commit: (v: string) => void;
  type?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        aria-label={label}
        key={String(value)}
        type={type}
        defaultValue={value}
        min={min}
        max={max}
        maxLength={type === "text" ? 200 : undefined}
        onBlur={(e) => {
          const el = e.currentTarget;
          if (
            el.value !== String(value) &&
            el.value.trim() &&
            el.validity.valid
          )
            commit(el.value);
          else el.value = String(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            e.currentTarget.value = String(value);
            e.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}
export function LayersPanel({ page }: { page: DesignPage }) {
  const [fold, setFold] = useState(new Set<string>()),
    doc = studio.document!;
  function toggle(id: string) {
    const s = new Set(fold);
    if (!s.delete(id)) s.add(id);
    setFold(s);
  }
  function order(dir: number) {
    const id = studio.selection[0],
      index = page.nodes.findIndex((n) => n.id === id);
    if (index < 0) return;
    const peers = page.nodes.filter(
        (n) => n.parentId === page.nodes[index].parentId,
      ),
      target = peers[peers.findIndex((n) => n.id === id) + dir];
    if (target)
      studio.mutate("Порядок слоя", () => {
        const j = page.nodes.indexOf(target);
        [page.nodes[index], page.nodes[j]] = [page.nodes[j], page.nodes[index]];
      });
  }
  function rows(id: string | null, depth: number): React.ReactNode {
    return page.nodes
      .filter((n) => n.parentId === id)
      .reverse()
      .map((n) => {
        const Icon = icons[n.kind],
          has = page.nodes.some((c) => c.parentId === n.id),
          closed = fold.has(n.id);
        return (
          <div key={n.id}>
            <div
              className={
                "layer-row " +
                (studio.selection.includes(n.id) ? "chosen " : "") +
                (n.hidden ? "dim" : "")
              }
              style={{ paddingLeft: 7 + depth * 12 }}
            >
              {has ? (
                <button
                  title={closed ? "Развернуть" : "Свернуть"}
                  onClick={() => toggle(n.id)}
                >
                  {closed ? <ChevronRight /> : <ChevronDown />}
                </button>
              ) : (
                <i />
              )}
              <button
                className="layer-name"
                aria-label={"Выбрать слой " + n.name}
                onClick={(e) => {
                  if (
                    inherited(page.nodes, n, "locked") ||
                    inherited(page.nodes, n, "hidden")
                  )
                    return;
                  studio.select(
                    e.shiftKey
                      ? studio.selection.includes(n.id)
                        ? studio.selection.filter((i) => i !== n.id)
                        : [...studio.selection, n.id]
                      : [n.id],
                  );
                }}
              >
                <Icon />
                {n.name}
              </button>
              <button
                title={n.locked ? "Разблокировать" : "Заблокировать"}
                className={n.locked ? "" : "hover-control"}
                onClick={() => {
                  studio.mutate("Блокировка", () => {
                    n.locked = !n.locked;
                  });
                  studio.select([]);
                }}
              >
                {n.locked ? <LockKeyhole /> : <UnlockKeyhole />}
              </button>
              <button
                title={n.hidden ? "Показать" : "Скрыть"}
                className={n.hidden ? "" : "hover-control"}
                onClick={() => {
                  studio.mutate("Видимость", () => {
                    n.hidden = !n.hidden;
                  });
                  studio.select([]);
                }}
              >
                {n.hidden ? <EyeOff /> : <Eye />}
              </button>
            </div>
            {has && !closed && rows(n.id, depth + 1)}
          </div>
        );
      });
  }
  return (
    <aside className="sidebar left">
      <div className="side-title">
        <span>
          <File /> Страницы
        </span>
        <button
          title="Добавить страницу"
          disabled={doc.pages.length >= 32}
          onClick={() => {
            studio.mutate("Новая страница", (d) => {
              const p = newPage("Страница " + (d.pages.length + 1));
              d.pages.push(p);
              d.activePageId = p.id;
            });
            studio.select([]);
          }}
        >
          <Plus />
        </button>
      </div>
      <div className="pages">
        {doc.pages.map((p) => (
          <button
            key={p.id}
            className={p.id === page.id ? "active-page" : ""}
            onClick={() => {
              studio.view(() => {
                doc.activePageId = p.id;
              });
              studio.select([]);
            }}
          >
            <File />
            {p.name}
          </button>
        ))}
      </div>
      <div className="side-title line">
        <span>
          <Layers /> Слои
        </span>
        <div>
          <button
            title="Поднять слой"
            disabled={studio.selection.length !== 1}
            onClick={() => order(1)}
          >
            <ArrowUp />
          </button>
          <button
            title="Опустить слой"
            disabled={studio.selection.length !== 1}
            onClick={() => order(-1)}
          >
            <ArrowDown />
          </button>
        </div>
      </div>
      <div className="layers">
        {rows(null, 0)}
        {page.nodes.length === 0 && (
          <p className="muted">Здесь появятся объекты страницы.</p>
        )}
      </div>
    </aside>
  );
}
const axes = [
  ["left", "По левому краю", AlignHorizontalJustifyStart],
  ["center", "По центру по горизонтали", AlignHorizontalJustifyCenter],
  ["right", "По правому краю", AlignHorizontalJustifyEnd],
  ["top", "По верхнему краю", AlignVerticalJustifyStart],
  ["middle", "По центру по вертикали", AlignVerticalJustifyCenter],
  ["bottom", "По нижнему краю", AlignVerticalJustifyEnd],
] as const;
export function Inspector({ page }: { page: DesignPage }) {
  const [tab, setTab] = useState("Дизайн"),
    doc = studio.document!;
  const nodes = page.nodes.filter((n) => studio.selection.includes(n.id)),
    n = nodes[0],
    box = selectionBounds(page.nodes, studio.selection);
  function assign(patch: Partial<DesignNode>) {
    studio.mutate("Свойства объекта", () => {
      for (const o of nodes) Object.assign(o, patch);
    });
  }
  function geometry(key: "x" | "y" | "width" | "height", value: string) {
    if (!box) return;
    const v = Number(value);
    studio.mutate("Геометрия", () => {
      if (key === "x" || key === "y")
        moveNodes(
          page.nodes,
          studio.selection,
          key === "x" ? v - box.x : 0,
          key === "y" ? v - box.y : 0,
        );
      else if (nodes.length === 1 && n.kind === "frame") n[key] = v;
      else resizeNodes(page.nodes, studio.selection, box, { ...box, [key]: v });
    });
  }
  function color(key: "fill" | "stroke", label: string) {
    return (
      <div className="paint">
        <input
          type="color"
          aria-label={label}
          value={n[key] === "none" ? "#ffffff" : n[key]}
          onChange={(e) => assign({ [key]: e.target.value })}
        />
        <input
          aria-label={label + " HEX"}
          key={n[key]}
          defaultValue={
            n[key] === "none" ? "Нет" : n[key].slice(1).toUpperCase()
          }
          maxLength={7}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          onBlur={(e) => {
            const val = e.target.value.replace(/^#/, "");
            if (/^[a-f\d]{6}$/i.test(val)) assign({ [key]: "#" + val });
            else
              e.target.value =
                n[key] === "none" ? "Нет" : n[key].slice(1).toUpperCase();
          }}
        />
        <button
          title={"Убрать " + label.toLowerCase()}
          onClick={() => assign({ [key]: "none" })}
        >
          <Minus />
        </button>
      </div>
    );
  }
  return (
    <aside className="sidebar right">
      <div className="tabs">
        {["Дизайн", "Прототип"].map((t) => (
          <button
            className={t === tab ? "selected" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {!n ? (
        <section>
          <h3>Страница</h3>
          <Field
            label="Название страницы"
            value={page.name}
            commit={(v) =>
              studio.mutate("Название страницы", () => {
                page.name = v.trim();
              })
            }
          />
          <div className="empty-inspector">
            <MousePointer2 />
            <p>Выберите объект на холсте, чтобы изменить его свойства.</p>
          </div>
        </section>
      ) : tab === "Прототип" ? (
        <section>
          <h3>Переход по щелчку</h3>
          <label className="stack">
            Целевой кадр
            <select
              aria-label="Целевой кадр"
              value={n.linkTo ?? ""}
              onChange={(e) => assign({ linkTo: e.target.value || null })}
            >
              <option value="">Без перехода</option>
              {doc.pages.flatMap((p) =>
                p.nodes
                  .filter((o) => o.kind === "frame")
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {p.name} / {f.name}
                    </option>
                  )),
              )}
            </select>
          </label>
          <p className="muted">
            Откройте просмотр ▶ и нажмите на объект, чтобы перейти к кадру.
          </p>
        </section>
      ) : (
        <>
          <section>
            <h3>
              {nodes.length === 1
                ? n.name
                : "Объектов выделено · " + nodes.length}
            </h3>
            {nodes.length === 1 && (
              <Field
                label="Имя слоя"
                value={n.name}
                commit={(v) => assign({ name: v.trim() })}
              />
            )}
            <div className="align">
              {axes.map(([axis, label, Icon]) => (
                <button
                  key={axis}
                  title={label}
                  disabled={nodes.length < 2}
                  onClick={() =>
                    studio.mutate("Выровнять", () =>
                      alignNodes(page.nodes, studio.selection, axis),
                    )
                  }
                >
                  <Icon />
                </button>
              ))}
            </div>
            {box && (
              <div className="fields">
                {(["x", "y", "width", "height"] as const).map((key, i) => (
                  <Field
                    key={key}
                    label={["X", "Y", "W", "H"][i]}
                    type="number"
                    min={i > 1 ? 1 : -1000000}
                    max={i > 1 ? 100000 : 1000000}
                    value={Number(box[key].toFixed(2))}
                    commit={(s) => geometry(key, s)}
                  />
                ))}
              </div>
            )}
            <div className="fields">
              {nodes.every((o) => !container(o)) && (
                <Field
                  label="Угол °"
                  type="number"
                  min={-360}
                  max={360}
                  value={n.rotation}
                  commit={(s) => assign({ rotation: Number(s) })}
                />
              )}
              <Field
                label="Видимость %"
                type="number"
                min={0}
                max={100}
                value={Math.round(n.opacity * 100)}
                commit={(s) => assign({ opacity: Number(s) / 100 })}
              />
            </div>
          </section>
          {n.kind === "text" && (
            <section>
              <h3>Текст</h3>
              <textarea
                className="inspector-text"
                aria-label="Содержание текста"
                key={n.id + n.text}
                defaultValue={n.text}
                onBlur={(e) => assign({ text: e.target.value })}
                maxLength={100000}
              />
              <label className="stack">
                Гарнитура
                <select
                  value={n.fontFamily}
                  onChange={(e) =>
                    assign({
                      fontFamily: e.target.value as DesignNode["fontFamily"],
                    })
                  }
                >
                  {["Inter", "Arial", "Georgia", "monospace"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <div className="fields">
                <Field
                  label="Размер"
                  type="number"
                  min={6}
                  max={1000}
                  value={n.fontSize}
                  commit={(s) => assign({ fontSize: Number(s) })}
                />
                <select
                  aria-label="Начертание"
                  value={n.fontWeight}
                  onChange={(e) =>
                    assign({
                      fontWeight: e.target.value as DesignNode["fontWeight"],
                    })
                  }
                >
                  {["400", "500", "600", "700"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </div>
              <select
                aria-label="Выравнивание текста"
                value={n.textAlign}
                onChange={(e) =>
                  assign({
                    textAlign: e.target.value as DesignNode["textAlign"],
                  })
                }
              >
                <option value="left">По левому краю</option>
                <option value="center">По центру</option>
                <option value="right">По правому краю</option>
              </select>
            </section>
          )}
          {!["line", "arrow", "path", "image", "group"].includes(n.kind) && (
            <section>
              <h3>Заливка</h3>
              {color("fill", "Заливка")}
              {["frame", "rect"].includes(n.kind) && (
                <Field
                  label="Скругление"
                  type="number"
                  min={0}
                  max={50000}
                  value={n.radius}
                  commit={(s) => assign({ radius: Number(s) })}
                />
              )}
            </section>
          )}
          {!["text", "image", "group"].includes(n.kind) && (
            <section>
              <h3>Обводка</h3>
              {color("stroke", "Обводка")}
              <Field
                label="Толщина"
                type="number"
                min={0}
                max={200}
                value={n.strokeWidth}
                commit={(s) => assign({ strokeWidth: Number(s) })}
              />
            </section>
          )}
          {nodes.length === 1 && container(n) && (
            <section>
              <h3>Компоновка</h3>
              <select
                aria-label="Компоновка"
                value={n.layout}
                onChange={(e) =>
                  studio.mutate("Компоновка", () =>
                    autoLayout(
                      page,
                      n.id,
                      e.target.value as DesignNode["layout"],
                    ),
                  )
                }
              >
                <option value="free">Свободная</option>
                <option value="horizontal">Горизонтально</option>
                <option value="vertical">Вертикально</option>
              </select>
              {n.layout !== "free" && (
                <>
                  <div className="fields">
                    {(["gap", "padding"] as const).map((k) => (
                      <Field
                        key={k}
                        label={k === "gap" ? "Шаг" : "Отступ"}
                        type="number"
                        min={0}
                        max={1000}
                        value={n[k]}
                        commit={(s) =>
                          studio.mutate("Интервалы", () => {
                            n[k] = Number(s);
                            autoLayout(page, n.id, n.layout);
                          })
                        }
                      />
                    ))}
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      studio.mutate("Разложить объекты", () =>
                        autoLayout(page, n.id, n.layout),
                      )
                    }
                  >
                    Разложить объекты
                  </button>
                </>
              )}
              {n.kind === "frame" && (
                <label className="check">
                  <input
                    type="checkbox"
                    checked={n.clip}
                    onChange={(e) => assign({ clip: e.target.checked })}
                  />
                  Обрезать содержимое
                </label>
              )}
            </section>
          )}
        </>
      )}
    </aside>
  );
}
