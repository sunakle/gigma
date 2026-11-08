import { test, expect, _electron as electron } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  copyFile,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { exportSVG } from "../../src/core/svg";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
async function launch() {
  const base = resolve("test-results/v2");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "profile-"));
  const env = { ...process.env, GIGMA_TEST_MODE: "1", GIGMA_DATA_DIR: root };
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
  return electron.launch({
    args: process.env.GIGMA_TEST_EXECUTABLE ? [] : [resolve(".")],
    executablePath: process.env.GIGMA_TEST_EXECUTABLE || require("electron"),
    env: env as Record<string, string>,
  });
}
test("Текст, перо, цвета, обои и расширения", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    await expect(p.locator("html")).toHaveAttribute("data-theme", "dark");
    await p.getByRole("button", { name: "Новый дизайн" }).click();
    await expect(p.getByText("Чистый холст")).toHaveCount(0);
    await expect(p.getByLabel("Тон палитры")).toHaveCSS(
      "background-image",
      /linear-gradient/,
    );
    const area = await p.getByLabel("Холст").boundingBox();
    const x = area!.x + 110,
      y = area!.y + 130;
    await p.getByRole("button", { name: "Текст", exact: true }).click();
    await p.mouse.click(x, y);
    await p.getByLabel("Текст на холсте").fill("Моя заметка");
    await p.getByLabel("Текст на холсте").press("Control+Enter");
    await p.mouse.dblclick(x + 17, y + 15);
    await p.getByLabel("Текст на холсте").fill("Лесная тропа");
    await p.getByLabel("Текст на холсте").press("Control+Enter");
    const corner = await p.locator("[data-handle=se]").boundingBox();
    await p.mouse.move(corner!.x + 3, corner!.y + 3);
    await p.mouse.down();
    await p.mouse.move(corner!.x + 60, corner!.y + 20, { steps: 5 });
    await p.mouse.up();
    expect(
      Number(await p.getByLabel("Размер", { exact: true }).inputValue()),
    ).toBeGreaterThan(24);
    await p
      .getByRole("button", { name: "Добавить коррекцию Инверсия" })
      .click();
    await p.getByLabel("Режим наложения").selectOption("screen");
    await p.getByRole("button", { name: "Расширения", exact: true }).click();
    await p.getByLabel("Лесная мастерская").check();
    await p.getByRole("button", { name: "Рабочая среда" }).click();
    await p.getByLabel("Файл обоев").setInputFiles({
      name: "wall.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGOs1zrBAANMcBZeDgBIzQF5oA/Q/gAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await expect(p.getByTitle("Убрать обои")).toBeVisible();
    await p.getByTitle("Закрыть", { exact: true }).click();
    await expect(p.locator(".wallpaper")).toHaveCount(1);
    await p.getByRole("button", { name: "Карандаш", exact: true }).click();
    const cdp = await p.context().newCDPSession(p);
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: x + 5,
      y: y + 150,
      button: "left",
      buttons: 1,
      clickCount: 1,
      pointerType: "pen",
      force: 0.1,
    });
    for (let i = 1; i <= 5; i++)
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: x + i * 20,
        y: y + 150,
        buttons: 1,
        pointerType: "pen",
        force: i / 5,
      });
    await cdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: x + 100,
      y: y + 150,
      button: "left",
      buttons: 0,
      clickCount: 1,
      pointerType: "pen",
    });
    await p.keyboard.press("Control+s");
    await expect(
      p.getByRole("status", { name: "Состояние сохранения" }),
    ).toHaveText("Все изменения сохранены");
    const data = await p.evaluate(async () => {
      const api = window.gigma!,
        files = await api.list();
      return (await api.load(files[0].id)).document;
    });
    const path = data.pages[0].nodes.find((n) => n.kind === "path")!;
    expect(new Set(path.points.map((p) => p.pressure)).size).toBeGreaterThan(2);
    expect(data.pages[0].nodes[0]).toMatchObject({
      text: "Лесная тропа",
      blend: "screen",
      adjustments: [{ kind: "invert", amount: 100 }],
    });
    await p.getByRole("button", { name: "Документы", exact: true }).click();
    await p.getByRole("button", { name: /Без названия/ }).click();
    await expect(p.locator(".wallpaper")).toHaveCount(1);
    await expect(p.getByLabel("Холст").getByText("Лесная тропа")).toBeVisible();
  } finally {
    await app.close();
  }
});
test("Открытие и размещение настоящего AI со слоями, кривыми и изображением", async ({}, info) => {
  test.skip(
    process.env.GIGMA_TEST_ILLUSTRATOR !== "1",
    "Требуется Illustrator для Windows",
  );
  test.setTimeout(240000);
  const dir = info.outputPath("ai-fixture");
  await mkdir(dir, { recursive: true });
  await copyFile(
    resolve("tests/integration/illustrator-fixture.jsx"),
    join(dir, "fixture.jsx"),
  );
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAE0lEQVR4nGOs1zrBAANMcBZeDgBIzQF5oA/Q/gAAAABJRU5ErkJggg==",
    "base64",
  );
  await writeFile(join(dir, "pixels.png"), image);
  await writeFile(join(dir, "detachable.png"), image);
  await promisify(execFile)(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; $ai=New-Object -ComObject Illustrator.Application; $null=$ai.DoJavaScriptFile((Join-Path (Get-Location).Path 'fixture.jsx'))",
    ],
    { cwd: dir, timeout: 120000, windowsHide: true },
  );
  const path = join(dir, "forest.ai"),
    original = await readFile(path),
    app = await launch();
  try {
    // Only the native Windows picker is substituted. Illustrator reads the on-disk AI through the real bridge.
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
    }, path);
    const p = await app.firstWindow();
    await p.getByRole("button", { name: "Открыть AI со слоями" }).click();
    const title = p.getByLabel("Название документа");
    await expect(title).toHaveValue("forest", { timeout: 45000 });
    await expect(
      p.getByRole("status", { name: "Состояние сохранения" }),
    ).toHaveText("Все изменения сохранены");
    const d = await p.evaluate(async () => {
      const api = window.gigma!;
      return (await api.load((await api.list())[0].id)).document;
    });
    const nodes = d.pages[0].nodes,
      by = (name: string) => nodes.find((n) => n.name === name)!;
    expect(nodes.filter((n) => n.kind === "frame").map((n) => n.name)).toEqual([
      "Первая",
      "Вторая",
    ]);
    expect(by("Вторая").x - by("Первая").x).toBeCloseTo(400);
    expect(by("Скрытый")).toMatchObject({
      hidden: true,
      locked: true,
      parentId: by("Лес").id,
    });
    expect(by("Секрет").parentId).toBe(by("Скрытый").id);
    expect(by("Крона").parentId).toBe(by("Дерево").id);
    expect(by("Дерево").parentId).toBe(by("Детали").id);
    expect(by("Детали").parentId).toBe(by("Лес").id);
    expect(by("Кривая").parentId).toBe(by("Земля").id);
    expect(by("Кривая").artwork?.editablePaint).toBe(true);
    expect(by("Заметки")).toMatchObject({
      kind: "group",
      artLayer: true,
      parentId: by("Земля").id,
    });
    expect(by("Связанное фото").parentId).toBe(by("Фото в рамке").id);
    expect(JSON.stringify(by("Градиент").artwork)).toContain("linearGradient");
    expect(JSON.stringify(by("Кривая").artwork)).toMatch(/[cC]/);
    expect(
      nodes.find((n) => n.kind === "image" && n.parentId === by("Дерево").id),
    ).toMatchObject({
      parentId: by("Дерево").id,
      width: 4,
      height: 4,
    });
    expect(
      nodes
        .find((n) => n.kind === "image" && n.parentId === by("Дерево").id)!
        .image.split(",")[1],
    ).toEqual(image.toString("base64"));
    expect(nodes.indexOf(by("Земля"))).toBeLessThan(nodes.indexOf(by("Лес")));
    const first = by("Первая"),
      svg = exportSVG(d.pages[0])
        .replace(
          /viewBox="[^"]+"/,
          'viewBox="' +
            [first.x, first.y, first.width, first.height].join(" ") +
            '"',
        )
        .replace(/width="[^"]+" height="[^"]+"/, 'width="720" height="480"');
    const different = await p.evaluate(
      async ({ svg, reference }) => {
        async function pixels(url: string) {
          const im = new Image();
          im.src = url;
          await im.decode();
          const cv = document.createElement("canvas");
          cv.width = 720;
          cv.height = 480;
          const ctx = cv.getContext("2d")!;
          ctx.drawImage(im, 0, 0, 720, 480);
          return ctx.getImageData(0, 0, 720, 480).data;
        }
        const url = URL.createObjectURL(
          new Blob([svg], { type: "image/svg+xml" }),
        );
        try {
          const a = await pixels(url),
            b = await pixels("data:image/png;base64," + reference);
          let mismatch = 0,
            painted = 0;
          for (let i = 0; i < a.length; i += 4) {
            if (b[i + 3] > 200) painted++;
            if (
              Math.abs(a[i + 3] - b[i + 3]) > 30 ||
              (b[i + 3] > 200 && Math.abs(a[i + 1] - b[i + 1]) > 15)
            )
              mismatch++;
          }
          return { mismatch, painted };
        } finally {
          URL.revokeObjectURL(url);
        }
      },
      {
        svg,
        reference: (await readFile(join(dir, "reference.png"))).toString(
          "base64",
        ),
      },
    );
    expect(different.painted).toBeGreaterThan(5000);
    expect(different.mismatch / different.painted).toBeLessThan(0.04);
    await p.getByRole("button", { name: "Документы", exact: true }).click();
    await p.getByRole("button", { name: /forest/ }).click();
    await expect(
      p.getByRole("button", { name: "Выбрать слой Кривая", exact: true }),
    ).toBeVisible();
    await p
      .getByRole("button", { name: "Выбрать слой Кривая", exact: true })
      .click();
    const curve = p.locator(
      '.surface [data-object="' + by("Кривая").id + '"] path',
    );
    await p.getByLabel("Цвет рисования", { exact: true }).fill("#da3903");
    await expect(curve).toHaveCSS("fill", "rgb(218, 57, 3)");
    await p.getByTitle("Отменить (Ctrl Z)").click();
    await expect(curve).toHaveCSS("fill", "rgb(24, 127, 63)");
    const before = await p.locator(".surface [data-object]").count();
    await p.getByRole("button", { name: "Поместить AI", exact: true }).click();
    await expect
      .poll(() => p.locator(".surface [data-object]").count(), {
        timeout: 45000,
      })
      .toBeGreaterThan(before);
    await p.getByTitle("Отменить (Ctrl Z)").click();
    await expect(p.locator(".surface [data-object]")).toHaveCount(before);
    const ai = await p.evaluate(
      async (doc) =>
        Array.from(
          (
            await window.gigma!.illustrator!({ mode: "export", document: doc })
          ).slice(0, 5),
        ),
      d,
    );
    expect(String.fromCharCode(...ai)).toBe("%PDF-");
    expect(await readFile(path)).toEqual(original);
    await rename(join(dir, "detachable.png"), join(dir, "moved-source.png"));
    await p.getByRole("button", { name: "Поместить AI", exact: true }).click();
    await expect(p.getByRole("alert")).toContainText(
      "Восстановлено изображений из встроенной копии AI: 1",
      { timeout: 90000 },
    );
    await expect(p.getByRole("alert")).toContainText(
      "Недоступны исходники для 1",
    );
    await p.keyboard.press("Control+s");
    await expect(
      p.getByRole("status", { name: "Состояние сохранения" }),
    ).toHaveText("Все изменения сохранены");
    const recovered = await p.evaluate(
      async (original) => {
        const api = window.gigma!;
        const saved = (await api.load((await api.list())[0].id)).document;
        const bitmap = [...saved.pages[0].nodes]
          .reverse()
          .find((n) => n.name === "Архивное фото" && n.kind === "image")!;
        async function pixels(uri: string) {
          const image = new Image();
          image.src = uri;
          await image.decode();
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(image, 0, 0);
          return {
            width: canvas.width,
            height: canvas.height,
            rgba: Array.from(
              ctx.getImageData(0, 0, canvas.width, canvas.height).data,
            ),
          };
        }
        return {
          actual: await pixels(bitmap.image),
          original: await pixels(original),
        };
      },
      "data:image/png;base64," + image.toString("base64"),
    );
    expect(recovered.actual).toEqual(recovered.original);
    await expect(
      p.getByRole("button", {
        name: "Выбрать слой Нет связанного файла — Вне областей",
        exact: true,
      }),
    ).toHaveCount(1);
    await p.getByTitle("Отменить (Ctrl Z)").click();
    await expect(p.locator(".surface [data-object]")).toHaveCount(before);
    const damaged = join(dir, "broken.ai");
    await writeFile(damaged, "invalid document");
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [file],
      });
    }, damaged);
    await p.getByRole("button", { name: "Поместить AI", exact: true }).click();
    await expect(p.getByRole("alert")).toContainText(
      "Файл не содержит документ Illustrator",
    );
    await expect(p.getByLabel("Название документа")).toHaveValue("forest");
    await expect(p.locator(".surface [data-object]")).toHaveCount(before);
  } finally {
    await app.close();
  }
});

test("Ввод на холсте сохраняет разметку строк и размеры", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    await p.getByRole("button", { name: "Новый дизайн" }).click();
    const stage = (await p.getByLabel("Холст").boundingBox())!,
      x = stage.x + stage.width * 0.4,
      y = stage.y + stage.height * 0.4;
    await p.getByRole("button", { name: "Текст", exact: true }).click();
    await p.mouse.click(x, y);
    const input = p.getByLabel("Текст на холсте"),
      text = p.locator(".surface [data-object] text"),
      lines = text.locator("tspan");
    const long = "акгмкмпк мкмкмккмм ккм — текст без внезапного переноса";
    await input.fill(long);
    await expect(lines).toHaveCount(1);
    await expect(lines.first()).toHaveText(long);
    await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(p.locator(".selection")).toHaveCount(0);
    expect(await input.evaluate((el) => el.clientWidth)).toBeGreaterThan(220);
    await input.press("End");
    await input.press("Enter");
    await p.keyboard.insertText("они");
    await expect(lines).toHaveCount(2);
    const compare = () =>
      text.evaluate((el) => ({
        lines: Array.from(el.children, (line) => ({
          text: line.textContent,
          box: line.getBoundingClientRect().toJSON(),
        })),
        color: getComputedStyle(el).fill,
        box: el.getBoundingClientRect().toJSON(),
      }));
    const auto = await compare();
    await input.press("Control+Enter");
    expect(await compare()).toEqual(auto);
    await p.getByLabel("W", { exact: true }).fill("135");
    await p.getByLabel("W", { exact: true }).press("Enter");
    await p.getByTitle("Увеличить", { exact: true }).click();
    await lines.first().dblclick();
    const wrapped = "Дорога в лес\nакгмкмпкмкмкмккммкмкмкмк";
    await input.fill(wrapped);
    expect(await lines.count()).toBeGreaterThan(2);
    const metrics = await input.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return [t.scrollHeight, t.clientHeight, t.scrollWidth, t.clientWidth];
    });
    expect(metrics[0]).toBeLessThanOrEqual(metrics[1] + 1);
    expect(metrics[2]).toBeLessThanOrEqual(metrics[3] + 1);
    const fixed = await compare();
    await input.press("Control+Enter");
    expect(await compare()).toEqual(fixed);
    await p.keyboard.press("Control+z");
    await expect(text).toContainText("текст без");
  } finally {
    await app.close();
  }
});
test("Активный цвет, живой спектр и одна отмена за перетаскивание", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    await p.getByRole("button", { name: "Новый дизайн" }).click();
    const stage = (await p.getByLabel("Холст").boundingBox())!,
      x = stage.x + 140,
      y = stage.y + 100;
    const color = p.getByLabel("Цвет рисования", { exact: true });
    await color.fill("#da3903");
    await p.getByRole("button", { name: "Кадр", exact: true }).click();
    await p.mouse.click(x, y);
    const frame = p.locator(".surface [data-object] > g > g > rect").first();
    await expect(frame).toHaveCSS("fill", "rgb(218, 57, 3)");
    const spectrum = (await p.locator(".spectrum").boundingBox())!;
    const spec = (sx: number, sy: number) =>
      p.mouse.move(
        spectrum.x + sx * spectrum.width,
        spectrum.y + sy * spectrum.height,
      );
    await spec(0.85, 0.2);
    await p.mouse.down();
    await spec(0.52, 0.3);
    await expect(frame).not.toHaveCSS("fill", "rgb(218, 57, 3)");
    const middle = await frame.evaluate((el) => getComputedStyle(el).fill);
    await spec(0.22, 0.62);
    await expect(frame).not.toHaveCSS("fill", middle);
    const end = await frame.evaluate((el) => getComputedStyle(el).fill);
    await p.mouse.up();
    await expect(frame).toHaveCSS("fill", end);
    await p.getByTitle("Отменить (Ctrl Z)").click();
    await expect(frame).toHaveCSS("fill", "rgb(218, 57, 3)");
    await p
      .getByRole("button", { name: "Выбрать слой Кадр", exact: true })
      .click();
    const hue = p.getByLabel("Тон палитры"),
      bar = (await hue.boundingBox())!;
    await p.mouse.move(bar.x + bar.width / 2, bar.y + bar.height * 0.25);
    await p.mouse.down();
    await p.mouse.move(bar.x + bar.width / 2, bar.y + bar.height * 0.8, {
      steps: 5,
    });
    await expect(frame).not.toHaveCSS("fill", "rgb(218, 57, 3)");
    const live = await frame.evaluate((el) => getComputedStyle(el).fill);
    await p.mouse.up();
    await expect(frame).toHaveCSS("fill", live);
    await p.getByTitle("Дополнительный цвет", { exact: true }).click();
    await p.getByLabel("Дополнительный цвет рисования").fill("#184a62");
    for (const [label, shape] of [
      ["Прямоугольник", "rect"],
      ["Эллипс", "ellipse"],
      ["Многоугольник", "polygon"],
      ["Кадр", "rect"],
    ]) {
      await p.getByRole("button", { name: label, exact: true }).click();
      await p.mouse.click(x + 16, y + 20);
      const selected = p.locator(
        `.surface [data-object] > g > g > ${shape}[fill*="gigma-paint"]`,
      );
      await expect(selected).toHaveCount(1);
      await expect(selected).toHaveCSS("fill", "rgb(24, 74, 98)");
    }
    await p.keyboard.press("Control+s");
    await expect(
      p.getByRole("status", { name: "Состояние сохранения" }),
    ).toHaveText("Все изменения сохранены");
    const saved = await p.evaluate(async () => {
      const api = window.gigma!;
      const { document } = await api.load((await api.list())[0].id);
      return document.pages[0].nodes.map((n) => n.fill);
    });
    expect(saved.slice(-4)).toEqual(Array(4).fill("#184a62"));
  } finally {
    await app.close();
  }
});
