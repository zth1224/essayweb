import { describe, expect, test } from "vitest";
import { sitePath } from "../../src/lib/site-path";

describe("sitePath", () => {
  test("keeps root deployment links absolute", () => {
    expect(sitePath("/fields/artificial-intelligence/", "/")).toBe("/fields/artificial-intelligence/");
  });

  test("prefixes GitHub Pages repository subpaths exactly once", () => {
    expect(sitePath("/papers/demo-ai-01/", "/paper-index/")).toBe("/paper-index/papers/demo-ai-01/");
    expect(sitePath("paper-index/", "/paper-index/")).toBe("/paper-index/paper-index/");
  });
});
