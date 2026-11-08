import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { newDocument, newNode } from "../../shared/model";
const require = createRequire(import.meta.url);
async function launch() {
  const base = resolve("test-results/v2");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "profile-"));
  const env = { ...process.env, GIGMA_TEST_MODE: "1", GIGMA_DATA_DIR: root };
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
  return electron.launch({
    args: [resolve(".")],
    executablePath: require("electron"),
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
test("Illustrator сохраняет AI и открывает его для размещения", async () => {
  test.skip(
    process.env.GIGMA_TEST_ILLUSTRATOR !== "1",
    "Требуется установленный Illustrator для Windows",
  );
  test.setTimeout(220000);
  const app = await launch();
  try {
    const page = await app.firstWindow();
    const d = newDocument("Проверка AI");
    d.pages[0].nodes.push(newNode("rect", 0, 0, 160, 90));
    const result = await page.evaluate(async (doc) => {
      const convert = window.gigma!.illustrator!,
        ai = await convert({ mode: "export", document: doc });
      const png = await convert({ mode: "import", bytes: ai });
      return {
        ai: String.fromCharCode(...ai.slice(0, 5)),
        png: Array.from(png.slice(0, 8)),
        width: new DataView(
          png.buffer,
          png.byteOffset,
          png.byteLength,
        ).getUint32(16),
      };
    }, d);
    expect(result.ai).toBe("%PDF-");
    expect(result.png).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.width).toBeGreaterThan(0);
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
