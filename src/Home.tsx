import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDownToLine,
  FolderOpen,
  Frame,
  LayoutGrid,
  PencilLine,
  Search,
  SquareDashed,
} from "lucide-react";
import {
  newDocument,
  type DesignDocument,
  type Summary,
} from "../shared/model";
import { exampleDocument } from "./core/example";
import { recoverDrafts } from "./core/browser-drafts";
import { storage } from "./core/storage";
export const Brand = () => (
  <span className="brand">
    <img className="g-logo" src="./gigma.svg" alt="" /> Gigma
  </span>
);
export function Home({
  settings,
  open,
  load,
  importFile,
  report,
}: {
  settings: () => void;
  open: (doc: DesignDocument) => void;
  load: (id: string) => void;
  importFile: () => void;
  report: (e: unknown) => void;
}) {
  const [docs, setDocs] = useState<Summary[]>([]),
    [folder, setFolder] = useState(""),
    [search, setSearch] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () => {
      recoverDrafts()
        .then(() => storage.list())
        .then((d) => {
          if (live) setDocs(d);
        })
        .catch(report);
    };
    refresh();
    storage
      .config()
      .then((c) => {
        if (live) setFolder(c.folder);
      })
      .catch(report);
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return (
    <div className="home">
      <header>
        <Brand />
        <span className="local-tag">
          <i />
          Локальное пространство
        </span>
      </header>
      <div className="home-body">
        <aside>
          <img className="g-logo big" src="./gigma.svg" alt="Gigma" />
          <h3>Моя студия</h3>
          <button onClick={settings}>Настройки</button>
          <button className="nav-active">
            <LayoutGrid /> Документы
          </button>
          <button onClick={() => storage.openFolder().catch(report)}>
            <FolderOpen /> Папка на ПК
          </button>
        </aside>
        <main>
          <div className="home-title">
            <div>
              <small>РАБОЧЕЕ ПРОСТРАНСТВО</small>
              <h1>Мои документы</h1>
            </div>
            <button className="secondary" onClick={importFile}>
              <ArrowDownToLine /> Импорт .gigma
            </button>
          </div>
          <div className="create-cards">
            <button
              className="create-card lavender"
              onClick={() => open(newDocument())}
            >
              <div className="card-art art-design">
                <i />
                <b />
                <em />
              </div>
              <strong>
                <Frame /> Новый дизайн <ArrowUpRight />
              </strong>
            </button>
            <button
              className="create-card yellow"
              onClick={() => open(newDocument("Новая доска", "board"))}
            >
              <div className="card-art art-board">
                <i />
                <b />
                <em />
              </div>
              <strong>
                <PencilLine /> Новая доска <ArrowUpRight />
              </strong>
            </button>
            <button
              className="create-card green"
              onClick={() => open(exampleDocument())}
            >
              <div className="card-art art-forma">
                <span>forma®</span>
                <i />
                <b />
              </div>
              <strong>
                <SquareDashed /> Открыть пример <ArrowUpRight />
              </strong>
            </button>
          </div>
          <div className="home-title sub">
            <h2>Сохранённые на ПК</h2>
            <label className="search">
              <Search />
              <input
                aria-label="Найти документ"
                placeholder="Найти документ"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="doc-grid">
            {docs
              .filter((d) =>
                d.name.toLowerCase().includes(search.toLowerCase()),
              )
              .map((d) => (
                <button
                  key={d.id}
                  className="doc-card"
                  onClick={() => load(d.id)}
                >
                  <div className={"cover " + d.mode}>
                    {d.cover && d.objects > 0 ? (
                      <img src={d.cover} alt="" />
                    ) : (
                      <Frame />
                    )}
                  </div>
                  <b>{d.name}</b>
                  <small>
                    {new Date(d.updatedAt).toLocaleString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {d.pages} стр.
                  </small>
                </button>
              ))}
          </div>
          {docs.length === 0 && (
            <div className="empty-docs">
              <FolderOpen />
              <strong>Пока пусто</strong>
              <p>Создайте документ выше. Он появится здесь после сохранения.</p>
            </div>
          )}
          {folder && (
            <button
              className="folder-foot"
              onClick={() => storage.openFolder().catch(report)}
            >
              <FolderOpen />
              {folder}
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
