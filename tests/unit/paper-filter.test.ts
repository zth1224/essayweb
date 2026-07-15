import { describe, expect, test } from "vitest";
import { getPapersByField } from "../../src/data/repository";
import { filterPapers, normalizeSearchValue } from "../../src/lib/paper-filter";

const papers = getPapersByField("embodied-intelligence");

describe("paper filtering", () => {
  test("normalizes case, full-width characters and repeated whitespace", () => {
    expect(normalizeSearchValue("  ＤＥＭＯ   AI  ")).toBe("demo ai");
  });

  test("searches titles, authors and tags", () => {
    expect(filterPapers(papers, { query: "RT-2" }).length).toBeGreaterThan(0);
    expect(filterPapers(papers, { query: "Google DeepMind" }).length).toBeGreaterThan(0);
  });

  test("combines field and reading-status filters", () => {
    const results = filterPapers(papers, {
      fieldId: "embodied-intelligence",
      status: "read",
      topicId: "robot-manipulation",
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((paper) => paper.status === "read" && paper.topicIds.includes("robot-manipulation"))).toBe(true);
  });

  test("returns all papers when filters are empty", () => {
    expect(filterPapers(papers, {})).toEqual(papers);
  });
});
