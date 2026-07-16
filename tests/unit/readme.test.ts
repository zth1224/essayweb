import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const readme = readFileSync(path.resolve(process.cwd(), "README.md"), "utf8");

describe("agent-ready README", () => {
  test("defines the source boundary and synchronized library surfaces", () => {
    expect(readme).toContain("D:\\essay");
    expect(readme).toContain("唯一内容源");
    expect(readme).toContain("bibliography/papers.csv");
    expect(readme).toContain("bibliography/paper-fields.csv");
    expect(readme).toContain("TERMS.md");
    expect(readme).toContain("topics/*.md");
  });

  test("documents every website field and the explicit mapping rule", () => {
    for (const fieldId of ["cs-ai", "cs-cl", "cs-cv", "cs-lg", "embodied-intelligence"]) {
      expect(readme).toContain(`\`${fieldId}\``);
    }
    expect(readme).toContain("禁止仅凭关键词");
  });

  test("documents the complete verified direct-deployment workflow", () => {
    for (const command of [
      "npm run sync:essay",
      "npm run check",
      "npm run test",
      "npm run test:e2e",
      "npm run build",
    ]) {
      expect(readme).toContain(command);
    }
    expect(readme).toContain("直接推送 `main`");
    expect(readme).toContain("HTTP 200");
    expect(readme).toContain("不得声称发布成功");
  });
});
