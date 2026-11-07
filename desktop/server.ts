import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { homedir } from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { DocumentStore } from "./document-store";
function documentsFolder() {
  if (process.platform === "win32") {
    const path = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);[Environment]::GetFolderPath('MyDocuments')",
      ],
      { encoding: "utf8", windowsHide: true },
    ).trim();
    if (path) return path;
  }
  return join(homedir(), "Documents");
}
const folder = process.env.GIGMA_DATA_DIR
    ? join(process.env.GIGMA_DATA_DIR, "documents")
    : join(documentsFolder(), "Gigma"),
  store = new DocumentStore(folder),
  dist = resolve(__dirname, "../dist"),
  port = Number(process.env.GIGMA_PORT || 5180),
  origin = `http://127.0.0.1:${port}`,
  token = randomBytes(32).toString("hex");
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", origin);
    if (req.headers.host !== `127.0.0.1:${port}`) {
      res.writeHead(403).end();
      return;
    }
    if (url.pathname.startsWith("/api/")) {
      const supplied = String(req.headers["x-gigma-token"] ?? "");
      if (
        supplied.length !== token.length ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(token)) ||
        (req.headers.origin && req.headers.origin !== origin)
      ) {
        res.writeHead(403).end();
        return;
      }
      let body: any = {};
      if (req.method === "POST") {
        let size = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 32 * 1024 * 1024)
            throw new Error("Документ больше 32 МиБ.");
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      }
      let result: unknown;
      if (req.method === "GET" && url.pathname === "/api/documents")
        result = await store.list();
      else if (
        req.method === "GET" &&
        url.pathname.startsWith("/api/document/")
      )
        result = await store.load(url.pathname.split("/").at(-1)!);
      else if (req.method === "POST" && url.pathname === "/api/save")
        result = await store.save(body.document, body.revision);
      else if (req.method === "GET" && url.pathname === "/api/config")
        result = { folder, desktop: false };
      else if (req.method === "POST" && url.pathname === "/api/folder") {
        await mkdir(folder, { recursive: true });
        const command =
          process.platform === "win32"
            ? "explorer.exe"
            : process.platform === "darwin"
              ? "open"
              : "xdg-open";
        spawn(command, [folder], { detached: true, stdio: "ignore" }).unref();
        result = { ok: true };
      } else {
        res.writeHead(404).end();
        return;
      }
      res
        .writeHead(200, {
          "content-type": "application/json",
          "cache-control": "no-store",
        })
        .end(JSON.stringify(result));
      return;
    }
    const file = resolve(
      dist,
      url.pathname === "/"
        ? "index.html"
        : decodeURIComponent(url.pathname).slice(1),
    );
    if (!file.startsWith(dist + sep)) {
      res.writeHead(403).end();
      return;
    }
    let data = await readFile(file);
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    if (file.endsWith("index.html"))
      data = Buffer.from(
        data
          .toString()
          .replace(
            "</head>",
            `<meta name="gigma-token" content="${token}"/></head>`,
          ),
      );
    res
      .writeHead(200, {
        "content-type": mime[extname(file)] ?? "application/octet-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      })
      .end(data);
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json" }).end(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Ошибка чтения документа.",
      }),
    );
  }
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Gigma: ${origin}\nДокументы: ${folder}`);
  if (process.platform === "win32" && process.argv.includes("--open"))
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", origin], {
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    }).unref();
});
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
