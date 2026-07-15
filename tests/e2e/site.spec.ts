import { expect, test } from "@playwright/test";

test("home presents five keyboard-accessible field lanes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("模板示例数据")).toBeVisible();
  await expect(page.locator("[data-field-link]")).toHaveCount(5);
  await expect(page.getByRole("link", { name: /人工智能/ })).toBeVisible();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fields\/artificial-intelligence\/$/);
});

test("field search, filtering and local reading status work together", async ({ page }) => {
  await page.goto("/fields/artificial-intelligence/");

  await expect(page.getByRole("heading", { name: "人工智能" })).toBeVisible();
  await expect(page.locator("[data-paper-card]")).toHaveCount(2);
  await page.getByRole("searchbox", { name: "搜索论文" }).fill("Demo AI Paper 01");
  await expect(page.locator("[data-paper-card]:visible")).toHaveCount(1);

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("combobox", { name: "阅读状态筛选" }).selectOption("reading");
  await expect(page.locator("[data-paper-card]:visible")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Demo AI Paper 02", exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "阅读状态筛选" }).selectOption("all");
  await page.getByRole("combobox", { name: "更新 Demo AI Paper 01 的阅读状态" }).selectOption("read");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "更新 Demo AI Paper 01 的阅读状态" })).toHaveValue("read");
});

test("paper details and term directory keep relationships navigable", async ({ page }, testInfo) => {
  await page.goto("/papers/demo-ai-01/");

  await expect(page.getByRole("heading", { name: "Demo AI Paper 01" })).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("navigation", { name: "文章目录" })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "方法概览" })).toBeVisible();
  await expect(page.getByRole("link", { name: /AI 示例术语 01/ })).toBeVisible();

  await page.goto("/terms/artificial-intelligence/");
  await expect(page.getByRole("heading", { name: "人工智能术语" })).toBeVisible();
  await page.getByRole("searchbox", { name: "搜索术语" }).fill("03");
  await expect(page.locator("details:visible")).toHaveCount(1);
  await page.locator("details:visible summary").click();
  await expect(page.locator("details:visible").getByText("用于验证术语索引", { exact: false })).toBeVisible();
});

test("mobile layout has no horizontal overflow and stacks terms after papers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only geometry check");
  await page.goto("/fields/embodied-intelligence/");

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    papersTop: document.querySelector("[data-paper-shelf]")?.getBoundingClientRect().top ?? 0,
    termsTop: document.querySelector("[data-terms-rail]")?.getBoundingClientRect().top ?? 0,
  }));

  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.termsTop).toBeGreaterThan(dimensions.papersTop);
});

test("all reachable internal links resolve without missing pages", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Crawl once with system Chrome.");

  const pending = ["/"];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const path = pending.shift()!;
    if (visited.has(path)) continue;

    const response = await page.goto(path);
    expect(response?.ok(), `Expected ${path} to resolve`).toBe(true);
    visited.add(path);

    const links = await page.locator("a[href]").evaluateAll((anchors) =>
      anchors.map((anchor) => new URL((anchor as HTMLAnchorElement).href, window.location.origin))
        .filter((url) => url.origin === window.location.origin)
        .map((url) => url.pathname),
    );

    for (const link of links) {
      if (!visited.has(link) && !pending.includes(link)) pending.push(link);
    }
  }

  expect(visited.size).toBe(21);
});
