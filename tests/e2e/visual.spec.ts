import { mkdir } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const outputDir = "artifacts/visual";

test("capture the approved desktop, tablet and mobile layouts", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Capture once with system Chrome.");
  await mkdir(outputDir, { recursive: true });

  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await page.screenshot({ path: `${outputDir}/home-1440.png`, fullPage: true });

  for (const viewport of [
    { width: 1440, height: 1100, name: "discover-1440" },
    { width: 390, height: 844, name: "discover-390" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/discover/");
    await expect(page.locator("[data-discovery-shelf] [data-discovery-card]")).toHaveCount(24);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${outputDir}/${viewport.name}.png`, fullPage: true });
  }

  for (const viewport of [
    { width: 1440, height: 1100, name: "field-1440" },
    { width: 768, height: 1024, name: "field-768" },
    { width: 390, height: 844, name: "field-390" },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/fields/embodied-intelligence/");
    await expect(page.locator("body")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `${outputDir}/${viewport.name}.png`, fullPage: true });
  }

  expect(consoleErrors).toEqual([]);
});
