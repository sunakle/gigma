import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join } from "node:path";
import { constants } from "node:fs";
import {
  copyFile,
  open,
  mkdtemp,
  readFile,
  writeFile,
  rm,
  rmdir,
  stat,
  readdir,
} from "node:fs/promises";
import { validateDocument, type IllustratorArtwork } from "../shared/model";
import { exportSVG } from "../src/core/svg";
const run = promisify(execFile);
let running = false;
async function bridge<T>(job: (dir: string) => Promise<T>) {
  if (process.platform !== "win32")
    throw Error("Для этого действия нужен Illustrator для Windows.");
  if (running)
    throw Error("Дождитесь завершения предыдущей операции Illustrator.");
  running = true;
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "gigma-ai-"));
    return await job(dir);
  } finally {
    if (dir) {
      for (const name of await readdir(dir).catch(() => []))
        await rm(join(dir, name), { force: true }).catch(() => {});
      await rmdir(dir).catch(() => {});
    }
    running = false;
  }
}
async function runScript(dir: string, input: string, script: string) {
  // Paths come from our file chooser and are encoded as data in the script.
  const fileLiteral = JSON.stringify(input).replace(
    /[\u007f-\uffff]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
  const jsx =
    "(function(){var root=File($.fileName).parent.fsName, old=app.userInteractionLevel, d=null;try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;d=app.open(new File(" +
    fileLiteral +
    "));" +
    script +
    "}catch(err){var f=new File(root+'/error.txt');f.encoding='UTF-8';if(f.open('w')){f.write(String(err));f.close();}}finally{try{if(d)d.close(SaveOptions.DONOTSAVECHANGES);}finally{app.userInteractionLevel=old;}}})();";
  await writeFile(join(dir, "convert.jsx"), "\uFEFF" + jsx, "utf8");
  try {
    await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; $ai=New-Object -ComObject Illustrator.Application; $null=$ai.DoJavaScriptFile((Join-Path (Get-Location).Path 'convert.jsx'))",
      ],
      { cwd: dir, windowsHide: true, timeout: 180000, maxBuffer: 65536 },
    );
  } catch {
    throw Error(
      "Illustrator не ответил. Проверьте, что программа установлена и в ней закрыты диалоговые окна.",
    );
  }
  const error = await readFile(join(dir, "error.txt"), "utf8").catch(() => "");
  if (error) throw Error("Illustrator: " + error.trim().slice(0, 350));
}
async function checkSize(path: string, limit: number) {
  const size = (await stat(path)).size;
  if (!size || size > limit * 1024 * 1024)
    throw Error("Размер файла выходит за предел " + limit + " МиБ.");
}
export async function openIllustratorFile(
  path: string,
): Promise<IllustratorArtwork> {
  if (extname(path).toLowerCase() !== ".ai")
    throw Error("Выберите документ .ai.");
  await checkSize(path, 128);
  const input = await open(path, "r");
  try {
    const header = Buffer.alloc(16);
    await input.read(header, 0, header.length, 0);
    if (
      !/^(%PDF-|%!PS-Adobe)/.test(header.toString("ascii")) &&
      header.readUInt32BE(0) !== 0xc5d0d3c6
    )
      throw Error("Файл не содержит документ Illustrator.");
  } finally {
    await input.close();
  }
  return bridge(async (dir) => {
    // A sibling copy preserves Illustrator's relative links without modifying an open original.
    let source = join(dirname(path), ".gigma-" + randomUUID() + ".ai");
    try {
      await copyFile(path, source, constants.COPYFILE_EXCL);
    } catch (err) {
      if (
        !["EACCES", "EPERM", "EROFS"].includes(
          (err as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw err;
      source = join(dir, "input.ai");
      await copyFile(path, source, constants.COPYFILE_EXCL);
    }
    try {
      const command = await readFile(
        join(__dirname, "illustrator-import.jsx"),
        "utf8",
      );
      await runScript(dir, source, command);
      const svg = join(dir, "result.svg"),
        manifest = join(dir, "layers.tsv");
      await checkSize(svg, 40);
      await checkSize(manifest, 8);
      return {
        name: basename(path, extname(path)),
        svg: await readFile(svg, "utf8"),
        layers: await readFile(manifest, "utf8"),
      };
    } finally {
      await rm(source, { force: true });
    }
  });
}
export async function convertIllustrator(job: {
  mode: "export";
  document: unknown;
  selection?: string[];
}): Promise<Uint8Array> {
  if (job?.mode !== "export") throw Error("Неизвестная операция Illustrator.");
  const doc = validateDocument(job.document),
    page = doc.pages.find((p) => p.id === doc.activePageId)!;
  if (
    job.selection &&
    (!Array.isArray(job.selection) ||
      job.selection.length > 20000 ||
      !job.selection.every((id) => typeof id === "string"))
  )
    throw Error("Недопустимое выделение.");
  return bridge(async (dir) => {
    const source = exportSVG(page, job.selection)
      .replace("<svg ", '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ')
      .replaceAll("<image href=", "<image xlink:href=");
    const input = join(dir, "input.svg"),
      out = join(dir, "result.ai");
    await writeFile(input, source);
    await runScript(
      dir,
      input,
      "var opts=new IllustratorSaveOptions();opts.pdfCompatible=true;d.saveAs(new File(root+'/result.ai'),opts);",
    );
    await checkSize(out, 64);
    return new Uint8Array(await readFile(out));
  });
}
