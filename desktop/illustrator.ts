import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import { validateDocument } from "../shared/model";
import { exportSVG } from "../src/core/svg";
const run = promisify(execFile);
type Job =
  | { mode: "import"; bytes: Uint8Array }
  | { mode: "export"; document: unknown; selection?: string[] };
let running = false;
export async function convertIllustrator(job: Job): Promise<Uint8Array> {
  if (process.platform !== "win32")
    throw Error("Для преобразования нужен Illustrator в Windows.");
  if (running)
    throw Error("Подождите завершения текущего преобразования Illustrator.");
  if (!job || !["import", "export"].includes(job.mode))
    throw Error("Неизвестная операция Illustrator.");
  let source: Buffer | string;
  if (job.mode === "import") {
    if (
      !(job.bytes instanceof Uint8Array) ||
      job.bytes.length > 32 * 1024 * 1024
    )
      throw Error("Для импорта выберите AI до 32 МиБ.");
    source = Buffer.from(job.bytes);
    if (!/^(%PDF-|%!PS-Adobe)/.test(source.subarray(0, 32).toString("ascii")))
      throw Error("Не найден заголовок документа Illustrator.");
  } else {
    const doc = validateDocument(job.document),
      page = doc.pages.find((p) => p.id === doc.activePageId)!;
    if (
      job.selection &&
      (!Array.isArray(job.selection) ||
        job.selection.length > 20000 ||
        !job.selection.every((id) => typeof id === "string"))
    )
      throw Error("Недопустимое выделение.");
    source = exportSVG(page, job.selection)
      .replace("<svg ", '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ')
      .replaceAll("<image href=", "<image xlink:href=");
  }
  running = true;
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "gigma-ai-"));
    const input = job.mode === "import" ? "input.ai" : "input.svg",
      output = job.mode === "import" ? "result.png" : "result.ai";
    await writeFile(join(dir, input), source);
    // Fixed application commands operate exclusively on a private copy in this job.
    const conversion =
      job.mode === "export"
        ? `var opts=new IllustratorSaveOptions();opts.pdfCompatible=true;d.saveAs(new File(root+'/result.ai'),opts);`
        : `d.artboards.setActiveArtboardIndex(0);var r=d.artboards[0].artboardRect;var k=Math.min(100,204800/Math.max(Math.abs(r[2]-r[0]),Math.abs(r[1]-r[3]),1));var opts=new ExportOptionsPNG24();opts.artBoardClipping=true;opts.transparency=true;opts.horizontalScale=k;opts.verticalScale=k;d.exportFile(new File(root+'/result.png'),ExportType.PNG24,opts);`;
    const jsx = `(function(){var root=File($.fileName).parent.fsName;var old=app.userInteractionLevel;var d=null;try{app.userInteractionLevel=UserInteractionLevel.DONTDISPLAYALERTS;d=app.open(new File(root+'/${input}'));${conversion}}finally{try{if(d)d.close(SaveOptions.DONOTSAVECHANGES);}finally{app.userInteractionLevel=old;}}})();`;
    await writeFile(join(dir, "convert.jsx"), jsx, "utf8");
    await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; $ai=New-Object -ComObject Illustrator.Application; $null=$ai.DoJavaScriptFile((Join-Path (Get-Location).Path 'convert.jsx'))",
      ],
      { cwd: dir, windowsHide: true, timeout: 90000, maxBuffer: 65536 },
    );
    const path = join(dir, output),
      size = (await stat(path)).size;
    if (size < 8 || size > (job.mode === "import" ? 10 : 64) * 1024 * 1024)
      throw Error("Размер результата выходит за пределы импорта или экспорта.");
    return new Uint8Array(await readFile(path));
  } catch (e) {
    throw Error(
      "Illustrator не завершил преобразование. Проверьте запуск Illustrator и доступ к сценариям. " +
        (e instanceof Error
          ? e.message.split("\n").slice(-3).join(" ").slice(0, 220)
          : ""),
    );
  } finally {
    running = false;
    if (dir) {
      for (const f of [
        "input.svg",
        "input.ai",
        "result.ai",
        "result.png",
        "convert.jsx",
      ])
        await rm(join(dir, f), { force: true }).catch(() => {});
      await rmdir(dir).catch(() => {});
    }
  }
}
