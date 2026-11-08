import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  Copy,
  File,
  Frame,
  Grid2X2,
  Group,
  Hand,
  Home as HomeIcon,
  ImagePlus,
  Menu,
  Minus,
  MousePointer2,
  MoveUpRight,
  Pencil,
  Play,
  Plus,
  Redo2,
  Save,
  Square,
  Type,
  Undo2,
  Ungroup,
  X,
} from "lucide-react";
import {
  newNode,
  uid,
  validateDocument,
  type DesignDocument,
  type DesignNode,
} from "../shared/model";
import { Canvas, fitPage, Scene, zoomAt, type Tool } from "./Canvas";
import { Inspector, LayersPanel } from "./Panels";
import { illustratorDocument } from "./core/illustrator";
import { textLines } from "./core/text-layout";
import { Settings } from "./Settings";
import { usePrefs } from "./core/preferences";
import {
  Settings2,
  Puzzle,
  Pipette,
  Eraser,
  Hexagon,
  MousePointer,
  FileInput,
} from "lucide-react";
import { Home } from "./Home";
import { rememberDraft } from "./core/browser-drafts";
import { storage } from "./core/storage";
import { studio } from "./core/studio";
import {
  descendants,
  duplicateNodes,
  groupNodes,
  inherited,
  moveNodes,
  removeNodes,
  roots,
  ungroupNodes,
  union,
} from "./core/geometry";
import { download, exportSVG, fileName, svgPNG } from "./core/svg";

const tools = [
  ["select", "Выделение", "V", MousePointer2],
  ["direct", "Прямое выделение", "D", MousePointer],
  ["frame", "Кадр", "F", Frame],
  ["rect", "Прямоугольник", "R", Square],
  ["ellipse", "Эллипс", "O", Circle],
  ["polygon", "Многоугольник", "Y", Hexagon],
  ["line", "Линия", "L", Minus],
  ["arrow", "Стрелка", "A", MoveUpRight],
  ["path", "Карандаш", "P", Pencil],
  ["text", "Текст", "T", Type],
  ["picker", "Пипетка", "I", Pipette],
  ["eraser", "Ластик объектов", "E", Eraser],
  ["pan", "Рука", "H", Hand],
] as const;
const blurField = () => {
  if (document.activeElement instanceof HTMLElement)
    document.activeElement.blur();
};
function filenameDate() {
  return new Date().toISOString().slice(0, 10);
}
export default function App() {
  useSyncExternalStore(studio.subscribe, studio.snapshot);
  const prefs = usePrefs();
  const [settings, setSettings] = useState<null | "settings" | "plugins">(null);
  const [home, setHome] = useState(true),
    [tool, setTool] = useState<Tool>("select"),
    [space, setSpace] = useState(false),
    [grid, setGrid] = useState(false);
  const [menu, setMenu] = useState(false),
    [modal, setModal] = useState<"" | "export" | "keys">(""),
    [preview, setPreview] = useState<string | null>(null);
  const [format, setFormat] = useState("svg"),
    [scope, setScope] = useState("page"),
    [scale, setScale] = useState(1),
    [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const importInput = useRef<HTMLInputElement>(null),
    imageInput = useRef<HTMLInputElement>(null);
  const clip = useRef<{ ids: string[]; nodes: DesignNode[] } | null>(null);
  const report = useCallback(
    (e: unknown) => setNotice(e instanceof Error ? e.message : String(e)),
    [],
  );
  const doc = studio.document,
    page = studio.page,
    sel = studio.selection;
  useEffect(() => {
    const close = async () => {
      blurField();
      await studio.flush();
    };
    const off = storage.onBeforeClose?.(close);
    const unload = (e: BeforeUnloadEvent) => {
      if (window.gigma) return;
      blurField();
      studio.finish();
      if (
        studio.document &&
        studio.generation !== studio.savedGeneration &&
        !rememberDraft(studio.document, studio.diskRevision)
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    const background = () => {
      if (document.visibilityState === "hidden") {
        blurField();
        void studio.save().catch(report);
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", background);
    return () => {
      off?.();
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", background);
    };
  }, [report]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 8500);
    return () => clearTimeout(t);
  }, [notice]);
  async function open(d: DesignDocument) {
    await studio.open(d);
    setTool("select");
    setHome(false);
    setMenu(false);
    setPreview(null);
    setModal("");
    if (!d.revision) {
      if (studio.page?.nodes.length)
        requestAnimationFrame(() => {
          if (studio.document?.id === d.id && studio.page) fitPage(studio.page);
        });
      await studio.save();
    }
  }
  async function goHome() {
    blurField();
    await studio.flush();
    setHome(true);
    setMenu(false);
    setModal("");
    studio.document = null;
    studio.emit();
  }
  async function load(id: string) {
    const r = await storage.load(id);
    await open(r.document);
    if (r.recovered) setNotice("Открыта резервная копия документа.");
  }
  async function importFile(f: File) {
    if (f.size > 32 * 1024 * 1024) throw new Error("Файл больше 32 МиБ.");
    const d = validateDocument(JSON.parse(await f.text()));
    d.id = uid();
    d.revision = 0;
    d.createdAt = new Date().toISOString();
    await open(d);
  }
  async function importAI(place: boolean) {
    if (busy || !window.gigma?.openIllustrator) return;
    const target = studio.document,
      targetPage = studio.page;
    setMenu(false);
    setBusy(true);
    try {
      const file = await window.gigma.openIllustrator();
      if (!file) return;
      const { document: imported, warnings } = illustratorDocument(file);
      if (place) {
        if (
          !target ||
          !targetPage ||
          studio.document !== target ||
          studio.page !== targetPage
        )
          throw Error("Текущий документ изменился. Повторите размещение AI.");
        const incoming = imported.pages[0].nodes;
        const wrapper = newNode("group", 0, 0, 1, 1);
        wrapper.name = imported.name;
        wrapper.artLayer = true;
        const box = union(incoming);
        if (box) Object.assign(wrapper, box);
        for (const n of incoming) if (!n.parentId) n.parentId = wrapper.id;
        const combined = {
          ...target,
          pages: target.pages.map((p) =>
            p === targetPage
              ? { ...p, nodes: [...p.nodes, wrapper, ...incoming] }
              : p,
          ),
        };
        validateDocument(combined);
        if (new Blob([JSON.stringify(combined)]).size > 31 * 1024 * 1024)
          throw Error(
            "После размещения документ превысит 32 МиБ. Откройте AI отдельно.",
          );
        studio.mutate("Поместить AI со слоями", (_, p) =>
          p.nodes.push(wrapper, ...incoming),
        );
        studio.select([wrapper.id]);
        fitPage(targetPage);
      } else await open(imported);
      setNotice(["Открыт AI со слоями.", ...warnings].join(" "));
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  }
  async function importImage(f: File) {
    if (
      !page ||
      !["image/png", "image/jpeg", "image/webp"].includes(f.type) ||
      f.size > 10 * 1024 * 1024
    )
      throw new Error("Выберите PNG, JPEG или WebP до 10 МиБ.");
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Не удалось прочитать файл."));
      reader.readAsDataURL(f);
    });
    const img = new Image();
    img.src = data;
    await img.decode();
    const host = document
      .querySelector("[data-stage]")!
      .getBoundingClientRect();
    const ratio = Math.min(
        1,
        800 / Math.max(img.naturalWidth, img.naturalHeight),
      ),
      w = img.naturalWidth * ratio,
      h = img.naturalHeight * ratio;
    const n = newNode(
      "image",
      (host.width / 2 - page.view.x) / page.view.zoom - w / 2,
      (host.height / 2 - page.view.y) / page.view.zoom - h / 2,
      Math.max(w, 1),
      Math.max(h, 1),
    );
    n.image = data;
    n.name = f.name.slice(0, 200);
    studio.mutate("Вставить изображение", (_, p) => p.nodes.push(n));
    studio.select([n.id]);
    setTool("select");
  }
  function command(action: string) {
    if (!page || !doc) return;
    setMenu(false);
    if (action === "home") {
      void goHome().catch(report);
      return;
    }
    if (action === "save") {
      blurField();
      void studio.save().catch(report);
      return;
    }
    if (action === "keys") {
      setModal("keys");
      return;
    }
    if (action === "undo") {
      studio.undo();
      return;
    }
    if (action === "redo") {
      studio.redo();
      return;
    }
    if (action === "selectAll") {
      studio.select(
        roots(
          page.nodes,
          page.nodes
            .filter(
              (n) =>
                !inherited(page.nodes, n, "locked") &&
                !inherited(page.nodes, n, "hidden"),
            )
            .map((n) => n.id),
        ),
      );
      return;
    }
    if (action === "copy" || action === "cut") {
      if (!sel.length) return;
      const ids = roots(page.nodes, sel),
        all = descendants(page.nodes, ids);
      clip.current = {
        ids,
        nodes: structuredClone(page.nodes.filter((n) => all.has(n.id))),
      };
      if (action === "copy") return;
    }
    if ((action === "cut" || action === "delete") && sel.length) {
      studio.mutate("Удалить объекты", (d, p) => removeNodes(d, p, sel));
      studio.select([]);
    }
    if (action === "paste" && clip.current) {
      const c = clip.current;
      const frames = new Set(
        doc.pages.flatMap((p) =>
          p.nodes.filter((n) => n.kind === "frame").map((n) => n.id),
        ),
      );
      const source = c.nodes.map((n) => ({
        ...n,
        linkTo:
          n.linkTo &&
          (frames.has(n.linkTo) || c.nodes.some((o) => o.id === n.linkTo))
            ? n.linkTo
            : null,
      }));
      studio.mutate("Вставить", (_, p) => {
        studio.selection = duplicateNodes(p, c.ids, 24, source);
      });
    }
    if (action === "duplicate" && sel.length)
      studio.mutate("Дублировать", (_, p) => {
        studio.selection = duplicateNodes(p, sel);
      });
    if (action === "group" && sel.length > 1)
      studio.mutate("Сгруппировать", (_, p) => {
        const id = groupNodes(p, sel);
        if (id) studio.selection = [id];
      });
    if (action === "ungroup" && sel.length)
      studio.mutate("Разгруппировать", (_, p) => {
        studio.selection = ungroupNodes(p, sel);
      });
  }
  const frames =
    doc?.pages.flatMap((p) =>
      p.nodes
        .filter((n) => n.kind === "frame" && !inherited(p.nodes, n, "hidden"))
        .map((n) => ({ p, n })),
    ) ?? [];
  const slide = frames.find((f) => f.n.id === preview);
  const slideIds = slide ? descendants(slide.p.nodes, [slide.n.id]) : null;
  function stepSlide(by: number) {
    if (!slide) return;
    setPreview(
      frames[(frames.indexOf(slide) + by + frames.length) % frames.length].n.id,
    );
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest(
          "input,textarea,select,[contenteditable=true]",
        ),
        ctrl = e.ctrlKey || e.metaKey;
      if (!home && ctrl && e.code === "KeyS") {
        e.preventDefault();
        command("save");
        return;
      }
      if (settings) {
        if (e.key === "Escape") setSettings(null);
        return;
      }
      if (typing || home) return;
      if (e.key === "Escape") {
        setMenu(false);
        setModal("");
        setPreview(null);
        setTool("select");
        studio.select([]);
        return;
      }
      if (preview) {
        if (e.key === "ArrowRight") stepSlide(1);
        if (e.key === "ArrowLeft") stepSlide(-1);
        return;
      }
      if (modal || !page) return;
      if (ctrl) {
        const action = (
          {
            KeyZ: e.shiftKey ? "redo" : "undo",
            KeyY: "redo",
            KeyC: "copy",
            KeyV: "paste",
            KeyX: "cut",
            KeyD: "duplicate",
            KeyG: e.shiftKey ? "ungroup" : "group",
            KeyA: "selectAll",
          } as Record<string, string>
        )[e.code];
        if (action) {
          e.preventDefault();
          command(action);
        }
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        command("delete");
        return;
      }
      if (e.code === "Digit1") {
        fitPage(page);
        return;
      }
      if (e.code === "Digit0") {
        zoomAt(page, 1);
        return;
      }
      const toolKey = tools.find((t) => "Key" + t[2] === e.code);
      if (toolKey) {
        setTool(toolKey[0]);
        return;
      }
      const delta = (
        {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        } as Record<string, number[]>
      )[e.key];
      if (delta && sel.length) {
        e.preventDefault();
        const k = (e.shiftKey ? 10 : 1) * prefs.nudge;
        studio.mutate("Сдвинуть", (_, p) =>
          moveNodes(p.nodes, sel, delta[0] * k, delta[1] * k),
        );
      }
    };
    const release = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    const blur = () => setSpace(false);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", release);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", blur);
    };
  });
  async function exportFile() {
    if (!doc || !page) return;
    setBusy(true);
    try {
      const name = fileName(doc.name);
      if (format === "ai") {
        if (!window.gigma?.illustrator)
          throw Error("Для AI откройте программу Gigma для Windows.");
        const result = await window.gigma.illustrator({
          mode: "export",
          document: {
            ...doc,
            cover: "",
            pages: doc.pages.map((p) => ({
              ...p,
              nodes: p.nodes.map((n) =>
                n.kind === "text" && n.textLayout === "wrap"
                  ? {
                      ...n,
                      text: textLines(n).join("\n"),
                      textLayout: "auto" as const,
                    }
                  : n,
              ),
            })),
          },
          selection: scope === "selection" ? sel : undefined,
        });
        download(
          new Blob([new Uint8Array(result)]),
          name + ".ai",
          "application/postscript",
        );
      } else if (format === "gigma")
        download(
          JSON.stringify({ ...doc, cover: "" }, null, 2),
          name + ".gigma",
        );
      else {
        const svg = exportSVG(
          page,
          scope === "selection" && sel.length ? sel : undefined,
        );
        if (format === "png") download(await svgPNG(svg, scale), name + ".png");
        else download(svg, name + ".svg", "image/svg+xml");
      }
      setModal("");
      setNotice("Файл подготовлен, скачивание начато.");
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  function backup() {
    if (doc)
      download(
        JSON.stringify({ ...doc, cover: "" }),
        fileName(doc.name) + "-" + filenameDate() + ".gigma",
      );
  }
  return (
    <>
      {home || !doc || !page ? (
        <Home
          settings={() => setSettings("settings")}
          open={(d) => void open(d).catch(report)}
          load={(id) => void load(id).catch(report)}
          importFile={() => importInput.current?.click()}
          openAI={
            window.gigma?.openIllustrator
              ? () => void importAI(false)
              : undefined
          }
          busy={busy}
          report={report}
        />
      ) : (
        <div className="editor">
          <header className="toolbar">
            <div className="menu-anchor">
              <button
                className="app-menu"
                title="Главное меню"
                aria-label="Главное меню"
                onClick={() => setMenu(!menu)}
              >
                <img src="./gigma.svg" className="g-logo" alt="Gigma" />
                <ChevronDown size={12} />
              </button>
              {menu && (
                <>
                  <button
                    className="menu-back"
                    aria-label="Закрыть меню"
                    onClick={() => setMenu(false)}
                  />
                  <div className="dropdown">
                    {window.gigma?.openIllustrator && (
                      <button
                        disabled={busy}
                        onClick={() => void importAI(false)}
                      >
                        <FileInput />
                        Открыть AI со слоями
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setMenu(false);
                        setSettings("settings");
                      }}
                    >
                      <Settings2 />
                      Настройки
                    </button>
                    <button
                      onClick={() => {
                        setMenu(false);
                        setSettings("plugins");
                      }}
                    >
                      <Puzzle />
                      Расширения
                    </button>
                    {(
                      [
                        ["home", "Мои документы", "", HomeIcon],
                        ["save", "Сохранить", "Ctrl S", Save],
                        ["undo", "Отменить", "Ctrl Z", Undo2],
                        ["redo", "Повторить", "Ctrl Shift Z", Redo2],
                        ["duplicate", "Дублировать", "Ctrl D", Copy],
                        ["group", "Сгруппировать", "Ctrl G", Group],
                        ["ungroup", "Разгруппировать", "Ctrl Shift G", Ungroup],
                        ["keys", "Горячие клавиши", "", Menu],
                      ] as const
                    ).map(([a, l, k, Icon]) => (
                      <button key={a} onClick={() => command(a)}>
                        <Icon />
                        {l}
                        <kbd>{k}</kbd>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="toolstrip" aria-label="Инструменты">
              {tools.map(([id, label, key, Icon]) => (
                <button
                  key={id}
                  title={label + " (" + key + ")"}
                  aria-label={label}
                  aria-pressed={tool === id}
                  className={tool === id ? "active-tool" : ""}
                  onClick={() => setTool(id)}
                >
                  <Icon />
                </button>
              ))}
              <button
                title="Вставить изображение"
                aria-label="Вставить изображение"
                onClick={() => imageInput.current?.click()}
              >
                <ImagePlus />
              </button>
              <button
                aria-label="Поместить AI"
                title={
                  window.gigma?.illustrator
                    ? "Поместить AI со слоями в текущий документ"
                    : "AI доступен в программе для Windows"
                }
                disabled={!window.gigma?.openIllustrator || busy}
                onClick={() => void importAI(true)}
              >
                <FileInput />
              </button>
            </div>
            <button
              title="Настройки рабочей среды"
              onClick={() => setSettings("settings")}
            >
              <Settings2 size={17} />
            </button>
            <button title="Расширения" onClick={() => setSettings("plugins")}>
              <Puzzle size={17} />
            </button>
            <input
              className="doc-title"
              aria-label="Название документа"
              key={doc.id + doc.name}
              defaultValue={doc.name}
              maxLength={200}
              onBlur={(e) => {
                const value = e.currentTarget.value.trim();
                if (value)
                  studio.mutate("Переименовать документ", (d) => {
                    d.name = value;
                  });
                else e.currentTarget.value = doc.name;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
            <div className="toolbar-end">
              <button
                title="Отменить (Ctrl Z)"
                disabled={!studio.undoStack.length}
                onClick={() => studio.undo()}
              >
                <Undo2 />
              </button>
              <button
                title="Повторить (Ctrl Shift Z)"
                disabled={!studio.redoStack.length}
                onClick={() => studio.redo()}
              >
                <Redo2 />
              </button>
              <span className="divider" />
              <button
                title="Просмотр прототипа"
                aria-label="Просмотр прототипа"
                disabled={!frames.length}
                onClick={() =>
                  setPreview(
                    frames.find((f) => sel.includes(f.n.id))?.n.id ??
                      frames[0].n.id,
                  )
                }
              >
                <Play />
              </button>
              <button
                className="primary"
                onClick={() => {
                  setScope(sel.length ? "selection" : "page");
                  setModal("export");
                }}
              >
                Экспорт
              </button>
            </div>
          </header>
          <div className="workspace">
            <LayersPanel page={page} />
            <Canvas
              key={page.id}
              page={page}
              tool={tool}
              setTool={setTool}
              space={space}
              grid={grid}
            />
            <Inspector page={page} brush={tool === "path"} />
          </div>
          <footer>
            {busy && !modal && <span>Подготовка файла Illustrator…</span>}
            <button
              title="К документам"
              onClick={() => void goHome().catch(report)}
            >
              <HomeIcon /> Документы
            </button>
            <span>/</span>
            <span>{page.name}</span>
            <div
              className="save-state"
              role="status"
              aria-label="Состояние сохранения"
            >
              <i
                className={
                  studio.status === "Все изменения сохранены" ? "ok" : ""
                }
              />
              {studio.status}
            </div>
            <button
              title="Точечная сетка"
              aria-pressed={grid}
              onClick={() => setGrid(!grid)}
            >
              <Grid2X2 />
            </button>
            <button
              title="Уменьшить"
              onClick={() => zoomAt(page, page.view.zoom / 1.25)}
            >
              <Minus />
            </button>
            <button title="Масштаб 100%" onClick={() => zoomAt(page, 1)}>
              {Math.round(page.view.zoom * 100)}%
            </button>
            <button
              title="Увеличить"
              onClick={() => zoomAt(page, page.view.zoom * 1.25)}
            >
              <Plus />
            </button>
            <button title="Вписать страницу" onClick={() => fitPage(page)}>
              <Frame />
            </button>
          </footer>
          {studio.error && (
            <div className="save-error">
              {studio.error}
              <button onClick={backup}>Скачать копию</button>
              <button onClick={() => void studio.saveCopy().catch(report)}>
                Сохранить как новый
              </button>
              <button onClick={() => void studio.save().catch(report)}>
                Повторить запись
              </button>
            </div>
          )}
        </div>
      )}
      <input
        hidden
        ref={importInput}
        type="file"
        accept=".gigma,application/json"
        aria-label="Файл документа"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importFile(f).catch(report);
        }}
      />
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Файл изображения"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void importImage(f).catch(report);
        }}
      />
      {settings && (
        <Settings
          initial={settings}
          close={() => setSettings(null)}
          report={report}
        />
      )}
      {modal && (
        <div className="veil">
          <div
            className="dialog"
            role="dialog"
            aria-label={modal === "keys" ? "Горячие клавиши" : "Экспорт"}
          >
            <div className="dialog-head">
              <h2>
                {modal === "keys" ? "Горячие клавиши" : "Экспорт документа"}
              </h2>
              <button title="Закрыть" onClick={() => setModal("")}>
                <X />
              </button>
            </div>
            {modal === "keys" ? (
              <div className="keys">
                {[
                  ["Инструменты", "V D F R O Y L A P T I E H"],
                  ["Переместить холст", "Пробел + перетаскивание"],
                  ["Изменить масштаб", "Ctrl + колесо"],
                  ["Вписать / масштаб 100%", "1 / 0"],
                  ["Отменить / повторить", "Ctrl Z / Ctrl Shift Z"],
                  ["Копировать / вырезать / вставить", "Ctrl C / X / V"],
                  ["Группировать / разгруппировать", "Ctrl G / Ctrl Shift G"],
                  ["Сохранить на ПК", "Ctrl S"],
                ].map(([l, k]) => (
                  <p key={l}>
                    {l}
                    <kbd>{k}</kbd>
                  </p>
                ))}
              </div>
            ) : (
              <>
                <label className="stack">
                  Формат
                  <select
                    aria-label="Формат экспорта"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                  >
                    <option value="svg">SVG · векторное изображение</option>
                    <option value="ai" disabled={!window.gigma?.illustrator}>
                      AI · через Illustrator для Windows
                    </option>
                    <option value="png">PNG · изображение</option>
                    <option value="gigma">
                      Gigma · редактируемый документ
                    </option>
                  </select>
                </label>
                {format !== "gigma" && (
                  <label className="stack">
                    Область
                    <select
                      value={scope}
                      onChange={(e) => setScope(e.target.value)}
                    >
                      <option value="page">Вся страница</option>
                      <option value="selection" disabled={!sel.length}>
                        Выбранные объекты
                      </option>
                    </select>
                  </label>
                )}
                {format === "png" && (
                  <label className="stack">
                    Масштаб
                    <select
                      value={scale}
                      onChange={(e) => setScale(Number(e.target.value))}
                    >
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                      <option value={3}>3×</option>
                    </select>
                  </label>
                )}
                <button
                  className="primary wide"
                  disabled={busy}
                  onClick={() => void exportFile()}
                >
                  <ArrowDownToLine />
                  {busy ? "Подготовка…" : "Скачать файл"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {slide && (
        <div
          className="presentation"
          role="dialog"
          aria-label="Просмотр прототипа"
        >
          <div className="present-bar">
            <b>{slide.n.name}</b>
            <button onClick={() => stepSlide(-1)} title="Предыдущий кадр">
              <ArrowLeft />
            </button>
            <span>
              {frames.indexOf(slide) + 1} / {frames.length}
            </span>
            <button onClick={() => stepSlide(1)} title="Следующий кадр">
              <ArrowRight />
            </button>
            <button title="Закрыть просмотр" onClick={() => setPreview(null)}>
              <X />
            </button>
          </div>
          <svg
            viewBox={[slide.n.x, slide.n.y, slide.n.width, slide.n.height].join(
              " ",
            )}
            style={{ aspectRatio: slide.n.width / slide.n.height }}
          >
            <Scene
              prefix="slide"
              nodes={slide.p.nodes
                .filter((n) => slideIds!.has(n.id))
                .map((n) =>
                  n.id === slide.n.id ? { ...n, parentId: null } : n,
                )}
              activate={setPreview}
            />
          </svg>
        </div>
      )}
      {notice && (
        <div role="alert" className="toast">
          {notice}
          <button title="Скрыть" onClick={() => setNotice("")}>
            <X />
          </button>
        </div>
      )}
    </>
  );
}
