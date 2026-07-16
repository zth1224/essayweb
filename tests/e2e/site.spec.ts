import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const discoverySnapshot = JSON.parse(readFileSync(resolve(process.cwd(), "src/data/generated/discovery.json"), "utf8")) as {
  generatedAt: string;
  papers: Array<{ title: string; publishedAt: string; librarySlug?: string }>;
  meta: { candidateCount: number; libraryMatchCount: number };
};

test("discovery balances age bands and supports an exact date range", async ({ page }) => {
  await page.goto("/discover/");
  await expect(page.locator("[data-discovery-root]")).toHaveAttribute("data-discovery-ready", "true");

  const cutoff = new Date(discoverySnapshot.generatedAt).getTime() - 180 * 86_400_000;
  const featuredDates = await page.locator("[data-discovery-feature]").evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.published ?? ""));
  expect(featuredDates.filter((date) => new Date(date).getTime() >= cutoff)).toHaveLength(1);
  expect(featuredDates.filter((date) => new Date(date).getTime() < cutoff)).toHaveLength(2);
  const dates = await page.locator("[data-discovery-shelf] [data-discovery-card]").evaluateAll((cards) => cards.map((card) => (card as HTMLElement).dataset.published ?? ""));
  expect(dates.filter((date) => new Date(date).getTime() >= cutoff)).toHaveLength(8);
  expect(dates.filter((date) => new Date(date).getTime() < cutoff)).toHaveLength(16);

  const oldestDate = [...discoverySnapshot.papers].sort((left, right) => left.publishedAt.localeCompare(right.publishedAt))[0].publishedAt.slice(0, 10);
  const expected = discoverySnapshot.papers.filter((paper) => paper.publishedAt.slice(0, 10) === oldestDate).length;
  await page.locator("[data-discovery-date-from]").fill(oldestDate);
  await page.locator("[data-discovery-date-to]").fill(oldestDate);
  await expect(page.locator("[data-discovery-count]")).toHaveText(String(expected));
  await expect(page.locator("[data-discovery-shelf] [data-discovery-card]").first()).toHaveAttribute("data-published", new RegExp(`^${oldestDate}`));
});

test("home presents five keyboard-accessible field lanes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("论文库快照", { exact: true })).toBeVisible();
  await expect(page.locator("[data-field-link]")).toHaveCount(5);
  await expect(page.getByRole("link", { name: /人工智能/ })).toBeVisible();

  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fields\/artificial-intelligence\/$/);
});

test("desktop field titles stay upright in vertical writing mode", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop-only vertical layout.");
  await page.goto("/");

  const titleStyle = await page.locator(".field-lane__titles").first().evaluate((element) => {
    const style = getComputedStyle(element);
    return { writingMode: style.writingMode, transform: style.transform };
  });

  expect(titleStyle.writingMode).toBe("vertical-rl");
  expect(titleStyle.transform).toBe("none");
});

test("field search, filtering and local reading status work together", async ({ page }) => {
  await page.goto("/fields/embodied-intelligence/");

  await expect(page.getByRole("heading", { name: "具身智能" })).toBeVisible();
  await expect(page.locator("[data-paper-card]")).toHaveCount(210);
  await expect(page.locator("[data-paper-card]:visible")).toHaveCount(24);
  await expect(page.locator("[data-result-count]")).toHaveText("210");
  await page.getByRole("searchbox", { name: "搜索论文" }).fill("Universal Manipulation Interface (UMI)");
  await expect(page.locator("[data-paper-card]:visible")).toHaveCount(1);

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("combobox", { name: "主题筛选" }).selectOption("robot-manipulation");
  await expect(page.locator("[data-result-count]")).toHaveText("167");
  await expect(page.locator("[data-paper-card]:visible")).toHaveCount(24);

  await page.getByRole("button", { name: "清除筛选" }).click();
  await page.getByRole("combobox", { name: "更新 Diffusion Policy: Visuomotor Policy Learning via Action Diffusion 的阅读状态" }).selectOption("read");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "更新 Diffusion Policy: Visuomotor Policy Learning via Action Diffusion 的阅读状态" })).toHaveValue("read");
});

test("cs.AI field publishes the two explicitly mapped papers", async ({ page }) => {
  await page.goto("/fields/artificial-intelligence/");

  await expect(page.getByRole("heading", { name: "人工智能", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Do AI Agents Know When a Task Is Simple/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Audio-Native Speech Recognition/ })).toBeVisible();
  await expect(page.locator("[data-paper-card]")).toHaveCount(2);
});

test("paper details and term directory keep relationships navigable", async ({ page }, testInfo) => {
  await page.goto("/papers/2023-diffusion-policy/");

  await expect(page.getByRole("heading", { name: "Diffusion Policy: Visuomotor Policy Learning via Action Diffusion" })).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await expect(page.getByRole("navigation", { name: "文章目录" })).toBeVisible();
  }
  await expect(page.getByRole("heading", { name: "方法详解" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Diffusion Policy/ }).first()).toBeVisible();

  await page.goto("/terms/embodied-intelligence/");
  await expect(page.getByRole("heading", { name: "具身智能术语" })).toBeVisible();
  await page.getByRole("searchbox", { name: "搜索术语" }).fill("Generative Behavior Cloning");
  await expect(page.locator("details:visible")).not.toHaveCount(0);
  await page.locator("details:visible summary").first().click();
  await expect(page.locator("details:visible").first()).toHaveAttribute("open", "");
});

test("discovery search, evidence and local shortlist work together", async ({ page }) => {
  const target = discoverySnapshot.papers.find((paper) => !paper.librarySlug)!;
  await page.goto("/discover/");

  await expect(page.locator("[data-source-warning]")).toBeVisible();
  await expect(page.locator("[data-discovery-shelf] [data-discovery-card]")).toHaveCount(24);
  await expect(page.locator("[data-discovery-count]")).toHaveText(String(discoverySnapshot.meta.candidateCount));

  await page.locator("[data-discovery-query]").fill(target.title);
  await expect(page.locator("[data-discovery-shelf] [data-discovery-card]")).toHaveCount(1);
  const card = page.locator("[data-discovery-shelf] [data-discovery-card]").first();
  await expect(card.locator("[data-card-title]")).toHaveText(target.title);
  await card.locator("details").click();
  await expect(card.locator("details")).toHaveAttribute("open", "");
  await card.locator("[data-decision-action='queued']").click();
  await expect(page.locator("[data-queue-count]")).toHaveText("1");

  await page.reload();
  await expect(page.locator("[data-queue-count]")).toHaveText("1");
  const download = page.waitForEvent("download");
  await page.locator("[data-queue-export]").click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("paper-reading-queue.md");
});

test("discovery collected filter links back to the reading library", async ({ page }) => {
  await page.goto("/discover/");
  await page.locator("[data-discovery-library]").selectOption("collected");
  await expect(page.locator("[data-discovery-count]")).toHaveText(String(discoverySnapshot.meta.libraryMatchCount));
  const link = page.locator("[data-discovery-shelf] [data-collected-link]:visible").first();
  await expect(link).toHaveAttribute("href", /\/papers\/.+\/$/);
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

test("discovery desk has no horizontal overflow on mobile", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "mobile-only geometry check");
  await page.goto("/discover/");
  await expect(page.locator("[data-discovery-shelf] [data-discovery-card]")).toHaveCount(24);
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test("all reachable internal links resolve without missing pages", async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Crawl once with system Chrome.");
  test.setTimeout(120_000);

  const pending = ["/"];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const path = pending.shift()!;
    if (visited.has(path)) continue;

    const response = await request.get(path);
    expect(response.ok(), `Expected ${path} to resolve`).toBe(true);
    visited.add(path);

    const html = await response.text();
    const responseUrl = new URL(response.url());
    const links = [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)]
      .map((match) => new URL(match[1].replaceAll("&amp;", "&"), responseUrl))
      .filter((url) => url.origin === responseUrl.origin)
      .map((url) => url.pathname);

    for (const link of links) {
      if (!visited.has(link) && !pending.includes(link)) pending.push(link);
    }
  }

  expect(visited.size).toBe(221);
});

test("field pages retain useful server-rendered content without JavaScript", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Check the fallback once.");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto("/fields/embodied-intelligence/");
  await expect(page.locator("[data-paper-card]")).toHaveCount(210);
  await expect(page.locator("[data-result-count]")).toHaveText("210");
  await expect(page.locator("[data-reading-status]").first()).toHaveValue("unread");

  await context.close();
});
