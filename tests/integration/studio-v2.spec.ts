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
import { newDocument, newNode } from "../../shared/model";
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
    expect([recovered.actual.width, recovered.actual.height]).toEqual([
      recovered.original.width,
      recovered.original.height,
    ]);
    // The fixture stores an untagged DeviceRGB image. Illustrator's working profile
    // can change its RGB channels slightly; alpha and pixel dimensions are exact.
    for (let i = 0; i < recovered.original.rgba.length; i++) {
      const error = Math.abs(
        recovered.actual.rgba[i] - recovered.original.rgba[i],
      );
      expect(error).toBeLessThanOrEqual(i % 4 === 3 ? 0 : 4);
    }
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

test("Чёткие пиксели и перемещение группы на большой странице", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    const doc = newDocument("Пиксели"),
      sheet = doc.pages[0];
    const group = newNode("group", 0, 0, 64, 64),
      sprite = newNode("image", 0, 0, 64, 64);
    sprite.parentId = group.id;
    sprite.image = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 2;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 2, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(1, 0, 1, 2);
      return c.toDataURL();
    });
    for (let i = 0; i < 500; i++) {
      const n = newNode("rect", 3000 + i, 3000, 4, 4);
      n.name = "Дальний " + i;
      sheet.nodes.push(n);
    }
    sheet.nodes.push(group, sprite);
    sheet.view = { x: 100, y: 90, zoom: 1.125 };
    await p.evaluate((d) => window.gigma!.save(d, 0), doc);
    await p.reload();
    await p.getByRole("button", { name: /Пиксели/ }).click();
    const image = p.locator(`.surface [data-object="${sprite.id}"] image`);
    await expect(image).toHaveCSS("image-rendering", "pixelated");
    expect(await p.locator(".layer-row").count()).toBeLessThan(80);
    const rows = p.locator(".layers");
    await rows.evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await expect(
      rows.getByRole("button", { name: "Выбрать слой Дальний 0", exact: true }),
    ).toBeVisible();
    const readColors = async (png: Buffer) =>
      p.evaluate(
        async (uri) => {
          const im = new Image();
          im.src = uri;
          await im.decode();
          const c = document.createElement("canvas");
          c.width = im.width;
          c.height = im.height;
          const ctx = c.getContext("2d")!;
          ctx.drawImage(im, 0, 0);
          const data = ctx.getImageData(
            0,
            Math.floor(c.height / 2),
            c.width,
            1,
          ).data;
          return [...new Set(Array.from(data).filter((_, i) => i % 4 === 0))];
        },
        "data:image/png;base64," + png.toString("base64"),
      );
    const b = (await image.boundingBox())!,
      x = b.x + 16,
      y = b.y + 24;
    // A hidden Electron window may first return the previous compositor frame.
    await expect
      .poll(
        async () =>
          readColors(
            Buffer.from(
              await app.evaluate(
                async ({ BrowserWindow }, rect) =>
                  (
                    await BrowserWindow.getAllWindows()[0].webContents.capturePage(
                      rect,
                    )
                  )
                    .toPNG()
                    .toString("base64"),
                {
                  x: Math.ceil(b.x) + 2,
                  y: Math.floor(b.y) + 5,
                  width: Math.floor(b.width) - 4,
                  height: 2,
                },
              ),
              "base64",
            ),
          ),
        { timeout: 12000 },
      )
      .toEqual([0, 255]);
    await p.mouse.move(x, y);
    await p.mouse.down();
    await p.mouse.move(x + 45, y + 18, { steps: 5 });
    expect((await image.boundingBox())!.x - b.x).toBeCloseTo(45);
    await p.mouse.up();
    const save = async () => {
      await p.keyboard.press("Control+s");
      await expect(
        p.getByRole("status", { name: "Состояние сохранения" }),
      ).toHaveText("Все изменения сохранены");
      return p.evaluate(
        async (id) => (await window.gigma!.load(id)).document.pages[0],
        doc.id,
      );
    };
    let saved = await save();
    for (const id of [group.id, sprite.id])
      expect(saved.nodes.find((n) => n.id === id)).toMatchObject({
        x: 40,
        y: 16,
      });
    await p.keyboard.press("Control+z");
    expect((await image.boundingBox())!.x).toBeCloseTo(b.x);
    await p.keyboard.press("Control+Shift+z");
    expect((await image.boundingBox())!.x).toBeCloseTo(b.x + 45);
    await p.mouse.move(x + 45, y + 18);
    await p.mouse.down({ button: "middle" });
    await p.mouse.move(x + 75, y + 36, { steps: 4 });
    await p.mouse.up({ button: "middle" });
    saved = await save();
    expect(saved.view).toEqual({ x: 130, y: 108, zoom: 1.125 });
    await p.keyboard.press("d");
    await image.click({ position: { x: 12, y: 12 } });
    await p.getByLabel("Отображение изображения").selectOption("auto");
    await expect(image).toHaveCSS("image-rendering", "auto");
    await p.getByTitle("Отменить (Ctrl Z)").click();
    await expect(image).toHaveCSS("image-rendering", "pixelated");
    await image.click({ position: { x: 12, y: 12 } });
    await p.getByRole("button", { name: "Экспорт", exact: true }).click();
    await p.getByLabel("Формат экспорта").selectOption("png");
    await p.getByLabel("Область").selectOption("selection");
    await p
      .getByRole("dialog")
      .getByLabel(/Масштаб/)
      .selectOption("3");
    const pngPath = resolve("test-results", "sprite-" + doc.id + ".png");
    await app.evaluate(({ session }, path) => {
      session.defaultSession.once("will-download", (_e, item) =>
        item.setSavePath(path),
      );
    }, pngPath);
    await p.getByRole("button", { name: "Скачать файл" }).click();
    await expect
      .poll(
        async () =>
          (await readFile(pngPath).catch(() => Buffer.alloc(0))).length,
      )
      .toBeGreaterThan(0);
    const exported = await readFile(pngPath);
    expect(exported.readUInt32BE(16)).toBe(192);
    expect(await readColors(exported)).toEqual([0, 255]);
  } finally {
    await app.close();
  }
});

test("Рамка внутри слоя выбирает только задетые детали рисунка", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow(),
      d = newDocument("Проверка выделения"),
      sheet = d.pages[0];
    const make = (
      kind: Parameters<typeof newNode>[0],
      name: string,
      x: number,
      y: number,
      w: number,
      h: number,
      parentId: string | null,
    ) => {
      const n = newNode(kind, x, y, w, h);
      n.name = name;
      n.parentId = parentId;
      sheet.nodes.push(n);
      return n;
    };
    const frame = make("frame", "Монтажная область", 0, 0, 330, 220, null);
    const layer = make("group", "Слой Illustrator", 15, 15, 270, 145, frame.id);
    layer.artLayer = true;
    const group = make("group", "Группа с соседом", 30, 35, 210, 85, layer.id);
    make("rect", "Шляпка", 30, 35, 22, 20, group.id);
    make("ellipse", "Ножка", 60, 37, 18, 18, group.id);
    make("rect", "Сосед", 210, 90, 30, 30, group.id);
    make("ellipse", "Круг рядом", 84, 62, 40, 40, layer.id);
    const locked = make("group", "Замок", 34, 38, 5, 5, layer.id);
    locked.locked = true;
    make("rect", "Недоступная деталь", 34, 38, 5, 5, locked.id);
    make("rect", "Скрытая деталь", 42, 37, 8, 8, layer.id).hidden = true;
    const transparent = make(
      "image",
      "Лист с отступом",
      15,
      15,
      122,
      130,
      layer.id,
    );
    transparent.image = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 16;
      c.getContext("2d")!.fillRect(12, 12, 4, 4);
      return c.toDataURL();
    });
    sheet.view = { x: 34, y: 38, zoom: 1.5 };
    await p.evaluate((doc) => window.gigma!.save(doc, 0), d);
    await p.reload();
    await p
      .getByRole("button", { name: "Проверка выделения", exact: false })
      .click();
    const stage = (await p.getByLabel("Холст").boundingBox())!;
    const mouse = (x: number, y: number) =>
      p.mouse.move(stage.x + 34 + x * 1.5, stage.y + 38 + y * 1.5);
    const drag = async (x: number, y: number, ex: number, ey: number) => {
      await mouse(x, y);
      await p.mouse.down();
      await mouse(ex, ey);
      await p.mouse.up();
    };
    const names = async () =>
      (
        await p.locator(".layer-row.chosen .layer-name").allTextContents()
      ).sort();
    await drag(22, 24, 88, 66);
    await expect.poll(names).toEqual(["Ножка", "Шляпка"]);
    await drag(46, 49, 56, 54);
    await expect.poll(names).toEqual(["Ножка", "Шляпка"]);
    await p.keyboard.press("Control+s");
    await expect(
      p.getByRole("status", { name: "Состояние сохранения" }),
    ).toHaveText("Все изменения сохранены");
    const saved = await p.evaluate(
      async (id) => (await window.gigma!.load(id)).document.pages[0].nodes,
      d.id,
    );
    for (const source of sheet.nodes.filter((n) => n.kind !== "group")) {
      const chosen = ["Шляпка", "Ножка"].includes(source.name),
        actual = saved.find((n) => n.id === source.id)!;
      expect(actual.x).toBeCloseTo(source.x + (chosen ? 10 : 0));
      expect(actual.y).toBeCloseTo(source.y + (chosen ? 5 : 0));
    }
    await p.keyboard.press("Control+z");
    await drag(88, 66, 22, 24);
    await expect.poll(names).toEqual(["Ножка", "Шляпка"]);
    await p.keyboard.down("Shift");
    await mouse(220, 100);
    await p.mouse.down();
    await p.mouse.up();
    await p.keyboard.up("Shift");
    await expect.poll(names).toEqual(["Ножка", "Сосед", "Шляпка"]);
    await drag(191, 140, 180, 132);
    await expect.poll(names).toEqual([]);
    await drag(145, 150, 113, 120);
    await expect.poll(names).toEqual(["Лист с отступом"]);
  } finally {
    await app.close();
  }
});

test("Группы вкладываются, а слои меняют порядок кнопками и перетаскиванием", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    const doc = newDocument("Вложенные группы");
    const a = newNode("group", 10, 10, 30, 30),
      b = newNode("group", 60, 10, 30, 30);
    a.name = "Группа А";
    b.name = "Группа Б";
    const child = newNode("rect", 60, 10, 30, 30),
      last = newNode("rect", 110, 10, 30, 30);
    child.name = "Деталь Б";
    last.name = "Последний";
    child.parentId = b.id;
    doc.pages[0].nodes.push(a, b, child, last);
    await p.evaluate((d) => window.gigma!.save(d, 0), doc);
    await p.reload();
    await p.getByRole("button", { name: /Вложенные группы/ }).click();
    const layer = (name: string) =>
      p.getByRole("button", { name: "Выбрать слой " + name });
    const saved = async () => {
      await p.keyboard.press("Control+s");
      await expect(
        p.getByRole("status", { name: "Состояние сохранения" }),
      ).toHaveText("Все изменения сохранены");
      return p.evaluate(
        async (id) => (await window.gigma!.load(id)).document.pages[0].nodes,
        doc.id,
      );
    };
    await layer("Группа А").click();
    await p.getByRole("button", { name: "Новая группа" }).click();
    let nodes = await saved();
    const nested = nodes.find((n) => n.name === "Группа 3")!;
    expect(nested.parentId).toBe(a.id);
    await layer("Группа Б").dragTo(
      p.locator(".layer-row").filter({ has: layer("Группа А") }),
    );
    nodes = await saved();
    expect(nodes.find((n) => n.id === b.id)?.parentId).toBe(a.id);
    expect(nodes.find((n) => n.id === child.id)?.parentId).toBe(b.id);
    await layer("Группа Б").dragTo(
      p.locator(".side-title.line").filter({ hasText: "Слои" }),
    );
    nodes = await saved();
    expect(nodes.find((n) => n.id === b.id)?.parentId).toBeNull();
    await layer("Группа Б").click();
    await p.getByRole("button", { name: "Опустить слой" }).click();
    nodes = await saved();
    expect(nodes.filter((n) => n.parentId === null).map((n) => n.id)).toEqual([
      a.id,
      b.id,
      last.id,
    ]);
    await layer("Последний").dragTo(
      p.locator(".layer-row").filter({ has: layer("Группа А") }),
      { targetPosition: { x: 60, y: 3 } },
    );
    nodes = await saved();
    expect(nodes.filter((n) => n.parentId === null).map((n) => n.id)).toEqual([
      last.id,
      a.id,
      b.id,
    ]);
    await p.keyboard.press("Control+z");
    nodes = await saved();
    expect(nodes.filter((n) => n.parentId === null).map((n) => n.id)).toEqual([
      a.id,
      b.id,
      last.id,
    ]);
  } finally {
    await app.close();
  }
});

test("ПКМ отделяет несколько рисунков и слоёв без изменения остальных", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    const doc = newDocument("Отделение рисунков");
    const nodes = doc.pages[0].nodes;
    const frame = newNode("frame", 0, 0, 300, 200);
    const base = newNode("group", 10, 10, 170, 90);
    base.name = "Основной слой";
    base.artLayer = true;
    base.parentId = frame.id;
    const mushroom = newNode("group", 20, 20, 120, 55);
    mushroom.name = "Гриб";
    mushroom.parentId = base.id;
    const cap = newNode("rect", 30, 30, 35, 30);
    cap.name = "Шляпка";
    cap.parentId = mushroom.id;
    const stem = newNode("ellipse", 90, 30, 30, 30);
    stem.name = "Ножка";
    stem.parentId = mushroom.id;
    const neighbor = newNode("group", 150, 30, 30, 30);
    neighbor.name = "Соседний слой";
    neighbor.artLayer = true;
    neighbor.parentId = frame.id;
    const other = newNode("rect", 150, 30, 30, 30);
    other.name = "Сосед";
    other.parentId = neighbor.id;
    nodes.push(frame, base, mushroom, cap, stem, neighbor, other);
    await p.evaluate((d) => window.gigma!.save(d, 0), doc);
    await p.reload();
    await p.getByRole("button", { name: /Отделение рисунков/ }).click();
    const layer = (name: string) =>
      p.getByRole("button", { name: "Выбрать слой " + name });
    const saved = async () => {
      await p.keyboard.press("Control+s");
      await expect(
        p.getByRole("status", { name: "Состояние сохранения" }),
      ).toHaveText("Все изменения сохранены");
      return p.evaluate(
        async (id) => (await window.gigma!.load(id)).document.pages[0].nodes,
        doc.id,
      );
    };
    await p.getByRole("button", { name: "Прямое выделение" }).click();
    const capShape = p.locator(`.surface [data-object="${cap.id}"] rect`);
    const stemShape = p.locator(`.surface [data-object="${stem.id}"] ellipse`);
    await capShape.click();
    await stemShape.click({ modifiers: ["Shift"] });
    await expect(p.locator(".layer-row.chosen .layer-name")).toHaveCount(2);
    await capShape.click({ button: "right" });
    await expect(
      p.getByRole("menu", { name: "Действия с выделением" }),
    ).toBeVisible();
    await p.getByRole("menuitem", { name: "Отделить в новый слой" }).click();
    let updated = await saved();
    const separated = updated.find((n) => n.name === "Отделённый слой 1")!;
    expect(separated).toMatchObject({ artLayer: true, parentId: frame.id });
    expect(updated.find((n) => n.id === cap.id)).toMatchObject({
      parentId: separated.id,
      x: 30,
      y: 30,
    });
    expect(updated.find((n) => n.id === stem.id)?.parentId).toBe(separated.id);
    expect(updated.find((n) => n.id === other.id)?.parentId).toBe(neighbor.id);
    await layer("Шляпка").click({ button: "right" });
    await p.getByRole("menuitem", { name: "Вынести на уровень выше" }).click();
    updated = await saved();
    expect(updated.find((n) => n.id === cap.id)?.parentId).toBe(frame.id);
    expect(updated.find((n) => n.id === stem.id)?.parentId).toBe(separated.id);
    await p.keyboard.press("Control+z");
    await p.keyboard.press("Control+z");
    updated = await saved();
    expect(updated.find((n) => n.id === cap.id)?.parentId).toBe(mushroom.id);
    expect(updated.find((n) => n.id === stem.id)?.parentId).toBe(mushroom.id);
    await layer("Гриб").click();
    await layer("Соседний слой").click({ modifiers: ["Control"] });
    await expect(p.locator(".layer-row.chosen .layer-name")).toHaveCount(2);
    await layer("Гриб").click({ button: "right" });
    await p.getByRole("menuitem", { name: "Отделить в новый слой" }).click();
    updated = await saved();
    const combined = updated.find((n) => n.name === "Отделённый слой 1")!;
    expect(updated.find((n) => n.id === mushroom.id)?.parentId).toBe(
      combined.id,
    );
    expect(updated.find((n) => n.id === neighbor.id)?.parentId).toBe(
      combined.id,
    );
    expect(updated.find((n) => n.id === other.id)?.parentId).toBe(neighbor.id);
  } finally {
    await app.close();
  }
});

test("Прямоугольник скругляется и сохраняется", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    await p.getByRole("button", { name: "Новый дизайн" }).click();
    const rect = (await p.getByLabel("Холст").boundingBox())!;
    await p.getByRole("button", { name: "Прямоугольник" }).click();
    await p.mouse.move(rect.x + 120, rect.y + 130);
    await p.mouse.down();
    await p.mouse.move(rect.x + 220, rect.y + 230);
    await p.mouse.up();
    await p.getByLabel("Радиус углов").fill("18");
    await p.getByLabel("Радиус углов").press("Enter");
    await expect(p.locator(".surface [data-object] rect[rx='18']")).toHaveCount(
      1,
    );
    await p.keyboard.press("Control+s");
    await expect(
      p.getByRole("status", { name: "Состояние сохранения" }),
    ).toHaveText("Все изменения сохранены");
    const title = await p.locator(".doc-title").inputValue();
    await p.reload();
    await p.getByRole("button", { name: title, exact: false }).click();
    await expect(p.locator(".surface [data-object] rect[rx='18']")).toHaveCount(
      1,
    );
  } finally {
    await app.close();
  }
});

test("Shift меняет размер изображения с сохранением пропорций", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    const doc = newDocument("Масштабирование изображения");
    const picture = newNode("image", 40, 60, 80, 40);
    picture.image = await p.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 2;
      canvas.getContext("2d")!.fillRect(0, 0, 4, 2);
      return canvas.toDataURL();
    });
    doc.pages[0].nodes.push(picture);
    await p.evaluate((d) => window.gigma!.save(d, 0), doc);
    await p.reload();
    await p
      .getByRole("button", { name: /Масштабирование изображения/ })
      .click();
    const image = p.locator(`.surface [data-object="${picture.id}"] image`);
    await image.click();
    const resize = async (
      handle: string,
      dx: number,
      dy: number,
      shift: boolean,
    ) => {
      const box = (await p.locator(`[data-handle="${handle}"]`).boundingBox())!;
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      if (shift) await p.keyboard.down("Shift");
      await p.mouse.down();
      await p.mouse.move(
        box.x + box.width / 2 + dx,
        box.y + box.height / 2 + dy,
        { steps: 3 },
      );
      await p.mouse.up();
      if (shift) await p.keyboard.up("Shift");
    };
    const dimensions = async () => {
      await p.keyboard.press("Control+s");
      await expect(
        p.getByRole("status", { name: "Состояние сохранения" }),
      ).toHaveText("Все изменения сохранены");
      const saved = await p.evaluate(
        async (id) => (await window.gigma!.load(id)).document,
        doc.id,
      );
      const n = saved.pages[0].nodes.find((node) => node.id === picture.id)!;
      return { x: n.x, y: n.y, width: n.width, height: n.height };
    };
    await resize("se", 40, 10, true);
    expect(await dimensions()).toEqual({
      x: 40,
      y: 60,
      width: 120,
      height: 60,
    });
    await resize("nw", 30, 15, true);
    expect(await dimensions()).toEqual({ x: 70, y: 75, width: 90, height: 45 });
    await resize("w", 20, 0, true);
    expect(await dimensions()).toEqual({ x: 90, y: 80, width: 70, height: 35 });
    await p.keyboard.press("Control+z");
    expect(await dimensions()).toEqual({ x: 70, y: 75, width: 90, height: 45 });
    await image.click();
    await resize("se", 30, 0, false);
    expect(await dimensions()).toEqual({
      x: 70,
      y: 75,
      width: 120,
      height: 45,
    });
  } finally {
    await app.close();
  }
});

test("Текст растягивается по ширине и высоте и остаётся редактируемым", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    const doc = newDocument("Деформация текста");
    const label = newNode("text", 40, 60, 120, 50);
    label.text = "Лесной замок";
    label.textLayout = "auto";
    doc.pages[0].nodes.push(label);
    await p.evaluate((d) => window.gigma!.save(d, 0), doc);
    await p.reload();
    await p.getByRole("button", { name: /Деформация текста/ }).click();
    await p.getByRole("button", { name: "Выбрать слой Текст" }).click();
    await p.getByLabel("Гарнитура").selectOption("Impact");
    const shown = p.locator(`.surface [data-object="${label.id}"] text`);
    await expect(shown).toHaveCSS("font-family", /Impact/);
    const initialWidth = (await shown.boundingBox())!.width;
    const resize = async (
      handle: string,
      dx: number,
      dy: number,
      shift = false,
    ) => {
      const box = (await p.locator(`[data-handle="${handle}"]`).boundingBox())!;
      await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      if (shift) await p.keyboard.down("Shift");
      await p.mouse.down();
      await p.mouse.move(
        box.x + box.width / 2 + dx,
        box.y + box.height / 2 + dy,
        { steps: 3 },
      );
      await p.mouse.up();
      if (shift) await p.keyboard.up("Shift");
    };
    await resize("e", 40, 0);
    expect((await shown.boundingBox())!.width).toBeGreaterThan(
      initialWidth * 1.25,
    );
    await resize("s", 0, 20);
    const afterVertical = (await shown.boundingBox())!;
    expect(afterVertical.height).toBeGreaterThan(24);
    const beforeShift = {
      width: Number(await p.getByLabel("W", { exact: true }).inputValue()),
      height: Number(await p.getByLabel("H", { exact: true }).inputValue()),
    };
    await resize("se", 32, 5, true);
    await p.keyboard.press("Control+s");
    await expect(
      p.getByRole("status", { name: "Состояние сохранения" }),
    ).toHaveText("Все изменения сохранены");
    const saved = await p.evaluate(
      async (id) => (await window.gigma!.load(id)).document,
      doc.id,
    );
    const text = saved.pages[0].nodes.find((n) => n.id === label.id)!;
    expect(text.fontFamily).toBe("Impact");
    expect(text.width).toBeGreaterThan(beforeShift.width);
    expect(text.height).toBeGreaterThan(beforeShift.height);
    expect(text.width / text.height).toBeCloseTo(
      beforeShift.width / beforeShift.height,
      2,
    );
    expect(text.textScaleX).toBeGreaterThan(1);
    await shown.dblclick();
    await p.getByLabel("Текст на холсте").fill("Новый лесной замок");
    await p.getByLabel("Текст на холсте").press("Control+Enter");
    await expect(shown).toHaveText("Новый лесной замок");
    await p.keyboard.press("Control+z");
    await expect(shown).toHaveText("Лесной замок");
  } finally {
    await app.close();
  }
});

test("Многострочный растянутый текст не выходит из рамки после правки и перезапуска", async () => {
  const app = await launch();
  try {
    const p = await app.firstWindow();
    const doc = newDocument("Рамка длинного текста");
    const label = newNode("text", 100, 100, 4500, 2025);
    label.text = "грибочек";
    label.textLayout = "wrap";
    label.fontSize = 1000;
    label.textScaleX = 4;
    doc.pages[0].nodes.push(label);
    doc.pages[0].view = { x: 80, y: 80, zoom: 0.1 };
    await p.evaluate((d) => window.gigma!.save(d, 0), doc);
    await p.reload();
    await p.getByRole("button", { name: /Рамка длинного текста/ }).click();
    await p.getByRole("button", { name: "Выбрать слой Текст" }).click();
    const text = p.locator(`.surface [data-object="${label.id}"] text`);
    const frame = p.locator(".surface .selection rect").first();
    const withinFrame = async () => {
      const letters = (await text.boundingBox())!;
      const box = (await frame.boundingBox())!;
      expect(letters.x).toBeGreaterThanOrEqual(box.x - 3);
      expect(letters.y).toBeGreaterThanOrEqual(box.y - 3);
      expect(letters.x + letters.width).toBeLessThanOrEqual(
        box.x + box.width + 3,
      );
      expect(letters.y + letters.height).toBeLessThanOrEqual(
        box.y + box.height + 3,
      );
    };
    await withinFrame();
    await text.dblclick();
    await p.getByLabel("Текст на холсте").fill("грибочек лес");
    await p.getByLabel("Текст на холсте").press("Control+Enter");
    await withinFrame();
    await p.keyboard.press("Control+s");
    await expect(
      p.getByRole("status", { name: "Состояние сохранения" }),
    ).toHaveText("Все изменения сохранены");
    await p.reload();
    await p.getByRole("button", { name: /Рамка длинного текста/ }).click();
    await p.getByRole("button", { name: "Выбрать слой Текст" }).click();
    await withinFrame();
  } finally {
    await app.close();
  }
});
