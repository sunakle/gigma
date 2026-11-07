import {
  test,
  expect,
  _electron as electron,
  chromium,
  type ElectronApplication,
} from "@playwright/test";
import { mkdir, mkdtemp, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
test("Редактирование → закрытие → перезапуск Windows → браузер → экспорт", async () => {
  const base = resolve("test-results/runtime");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "gigma-"));
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    GIGMA_DATA_DIR: root,
    GIGMA_TEST_MODE: "1",
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      args: process.env.GIGMA_TEST_EXECUTABLE ? [] : [resolve(".")],
      executablePath:
        process.env.GIGMA_TEST_EXECUTABLE || (require("electron") as string),
      env,
    });
  const close = async (app: ElectronApplication) => {
    await Promise.all([
      app.waitForEvent("close"),
      app
        .evaluate(({ BrowserWindow }) => {
          BrowserWindow.getAllWindows()[0].close();
        })
        .catch(() => {}),
    ]);
  };
  let app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Новый дизайн" }).click();
    await page.getByLabel("Название документа").fill("План мастерской");
    await page.getByLabel("Название документа").press("Enter");
    const stage = await page.getByLabel("Холст").boundingBox();
    expect(stage).toBeTruthy();
    const x = stage!.x + 130,
      y = stage!.y + 110;
    await page
      .getByRole("button", { name: "Прямоугольник", exact: true })
      .click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 160, y + 90, { steps: 5 });
    await page.mouse.up();
    const rect = page.getByRole("button", {
      name: "Выбрать слой Прямоугольник",
    });
    await expect(rect).toHaveCount(1);
    await page.keyboard.press("Control+z");
    await expect(rect).toHaveCount(0);
    await page.keyboard.press("Control+Shift+z");
    await expect(rect).toHaveCount(1);
    await rect.click();
    await page.getByLabel("Заливка HEX").fill("5577BB");
    await page.getByLabel("Заливка HEX").press("Enter");
    await page.getByRole("button", { name: "Текст", exact: true }).click();
    await page.mouse.click(x + 25, y + 125);
    await page.getByLabel("Текст на холсте").fill("Идея для игры");
    // A normal window close must commit even the still-focused text editor.
    await close(app);
    app = await launch();
    const reopened = await app.firstWindow();
    await reopened.getByRole("button", { name: /План мастерской/ }).click();
    await expect(
      reopened.getByLabel("Холст").getByText("Идея для игры"),
    ).toBeVisible();
    await expect(
      reopened.getByRole("button", { name: "Выбрать слой Прямоугольник" }),
    ).toHaveCount(1);
    const files = await readdir(join(root, "documents"));
    const file = files.find((f) => f.endsWith(".gigma"))!;
    const doc = JSON.parse(
      await readFile(join(root, "documents", file), "utf8"),
    );
    expect(doc.pages[0].nodes[0]).toMatchObject({
      width: 160,
      height: 90,
      fill: "#5577BB",
    });
    expect(doc.pages[0].nodes[1].text).toBe("Идея для игры");
  } finally {
    if (!app.process().exitCode && app.process().exitCode !== 0)
      await app.close().catch(() => {});
  }
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((ok, fail) =>
    reservation.close((e) => (e ? fail(e) : ok())),
  );
  const server = spawn(process.execPath, ["build/server.cjs"], {
    env: { ...env, GIGMA_PORT: String(port) },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await once(server.stdout, "data");
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({
      viewport: { width: 1320, height: 820 },
    });
    const tab = await context.newPage();
    await tab.goto("http://127.0.0.1:" + port);
    await tab.getByRole("button", { name: /План мастерской/ }).click();
    await expect(
      tab.getByLabel("Холст").getByText("Идея для игры"),
    ).toBeVisible();
    await tab
      .getByRole("button", { name: "Выбрать слой Прямоугольник" })
      .click();
    await tab.getByRole("button", { name: "Экспорт", exact: true }).click();
    await tab.getByLabel("Формат экспорта").selectOption("png");
    const downloaded = tab.waitForEvent("download");
    await tab.getByRole("button", { name: "Скачать файл" }).click();
    const download = await downloaded;
    const bytes = await readFile((await download.path())!);
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(160);
    expect(bytes.readUInt32BE(20)).toBe(90);
    await tab.getByLabel("Название документа").fill("Из браузера");
    await tab.getByLabel("Название документа").press("Enter");
    await tab.keyboard.press("Control+s");
    await expect(tab.getByRole("status")).toHaveText("Все изменения сохранены");
    await tab.reload();
    await tab.getByRole("button", { name: /Из браузера/ }).click();
    await expect(
      tab.getByLabel("Холст").getByText("Идея для игры"),
    ).toBeVisible();
    await tab.getByLabel("Название документа").fill("Последняя правка вкладки");
    // Pause network saves for this tab, close it, then replay the offline draft in a new tab.
    await tab.route("**/api/save", (route) => route.abort());
    await tab.getByLabel("Название документа").press("Enter");
    const next = await context.newPage();
    await tab.close({ runBeforeUnload: true });
    await next.goto("http://127.0.0.1:" + port);
    await expect(
      next.getByRole("button", { name: /Последняя правка вкладки/ }),
    ).toBeVisible();
    await next.getByRole("button", { name: "Открыть пример" }).click();
    await next.screenshot({ path: join(base, "editor.png") });
    await next.getByRole("button", { name: "Просмотр прототипа" }).click();
    await expect(
      next.getByRole("dialog", { name: "Просмотр прототипа" }),
    ).toBeVisible();
    await next.getByTitle("Следующий кадр").click();
    await expect(next.locator(".present-bar b")).toHaveText("Мобильная версия");
  } finally {
    await browser?.close();
    server.kill();
  }
});
