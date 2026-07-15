import { describe, expect, test } from "vitest";
import { papers } from "../../src/data/demo";
import { filterPapers, normalizeSearchValue } from "../../src/lib/paper-filter";

describe("paper filtering", () => {
  test("normalizes case, full-width characters and repeated whitespace", () => {
    expect(normalizeSearchValue("  ＤＥＭＯ   AI  ")).toBe("demo ai");
  });

  test("searches titles, authors and tags", () => {
    expect(filterPapers(papers, { query: "DEMO AI" })).toHaveLength(2);
    expect(filterPapers(papers, { query: "Author CV 2" })).toHaveLength(1);
    expect(filterPapers(papers, { query: "robotics-template" })).toHaveLength(2);
  });

  test("combines field and reading-status filters", () => {
    const results = filterPapers(papers, {
      fieldId: "cs-ai",
      status: "reading",
    });

    expect(results.map((paper) => paper.slug)).toEqual(["demo-ai-02"]);
  });

  test("returns all papers when filters are empty", () => {
    expect(filterPapers(papers, {})).toEqual(papers);
  });
});
