import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  session,
  shell,
} from "electron";
import { join, resolve, extname, sep } from "node:path";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { convertIllustrator } from "./illustrator";
import { DocumentStore } from "./document-store";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "gigma",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
if (process.env.GIGMA_DATA_DIR) {
  const runtime = join(process.env.GIGMA_DATA_DIR, "runtime");
  mkdirSync(runtime, { recursive: true });
  app.setPath("userData", runtime);
}
app.setName("Gigma");
let win: BrowserWindow | null = null,
  allowClose = false;
const locked = app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    const folder = process.env.GIGMA_DATA_DIR
      ? join(process.env.GIGMA_DATA_DIR, "documents")
      : join(app.getPath("documents"), "Gigma");
    const store = new DocumentStore(folder);
    const dist = resolve(__dirname, "../dist");
    protocol.handle("gigma", async (request) => {
      try {
        const url = new URL(request.url);
        if (url.host !== "app") return new Response("", { status: 403 });
        const relative =
          decodeURIComponent(url.pathname) === "/"
            ? "index.html"
            : decodeURIComponent(url.pathname).slice(1);
        const file = resolve(dist, relative);
        if (!file.startsWith(dist + sep))
          return new Response("", { status: 403 });
        const data = await readFile(file);
        const mime: Record<string, string> = {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".png": "image/png",
        };
        return new Response(new Uint8Array(data), {
          headers: {
            "content-type": mime[extname(file)] ?? "application/octet-stream",
          },
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      width: 1440,
      height: 940,
      minWidth: 1000,
      minHeight: 680,
      title: "Gigma",
      backgroundColor: "#26272c",
      icon: join(dist, "gigma.ico"),
      show: process.env.GIGMA_TEST_MODE !== "1",
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    const trusted = (
      event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
    ) => {
      if (
        event.sender !== win?.webContents ||
        !event.senderFrame?.url.startsWith("gigma://app/")
      )
        throw new Error("Недопустимый источник запроса.");
    };
    ipcMain.handle("gigma:illustrator", (event, payload) => {
      trusted(event);
      return convertIllustrator(payload);
    });
    ipcMain.handle("gigma:list", (event) => {
      trusted(event);
      return store.list();
    });
    ipcMain.handle("gigma:load", (event, id) => {
      trusted(event);
      return store.load(id);
    });
    ipcMain.handle("gigma:save", (event, doc, revision) => {
      trusted(event);
      return store.save(doc, revision);
    });
    ipcMain.handle("gigma:config", (event) => {
      trusted(event);
      return { folder, desktop: true };
    });
    ipcMain.handle("gigma:folder", async (event) => {
      trusted(event);
      mkdirSync(folder, { recursive: true });
      const error = await shell.openPath(folder);
      if (error) throw new Error(error);
    });
    ipcMain.on("gigma:close-ready", async (event) => {
      trusted(event);
      await store.idle();
      allowClose = true;
      win?.close();
    });
    win.on("close", (event) => {
      if (!allowClose) {
        event.preventDefault();
        win?.webContents.send("gigma:before-close");
      }
    });
    win.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("gigma://app/")) event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await win.loadURL("gigma://app/index.html");
  });
  app.on("window-all-closed", () => app.quit());
}
