import { describe, expect, test } from "vitest";
import { fields } from "../../src/data/fields";
import { papers, terms } from "../../src/data/demo";
import {
  getFieldBySlug,
  getPaperById,
  getPaperBySlug,
  getPapersByField,
  getTermsByIds,
  getTermsByField,
  validateDemoRelationships,
} from "../../src/data/repository";

describe("demo knowledge model", () => {
  test("defines five unique research fields", () => {
    expect(fields).toHaveLength(5);
    expect(new Set(fields.map((field) => field.id)).size).toBe(5);
    expect(new Set(fields.map((field) => field.slug)).size).toBe(5);
    expect(new Set(fields.map((field) => field.accent)).size).toBe(5);
  });

  test("provides two demo papers and three terms per field", () => {
    for (const field of fields) {
      expect(getPapersByField(field.id)).toHaveLength(2);
      expect(getTermsByField(field.id)).toHaveLength(3);
    }
    expect(papers).toHaveLength(10);
    expect(terms).toHaveLength(15);
  });

  test("resolves routes by slug", () => {
    expect(getFieldBySlug("artificial-intelligence")?.id).toBe("cs-ai");
    expect(getPaperBySlug("demo-ai-01")?.id).toBe("paper-ai-01");
    expect(getPaperBySlug("missing-paper")).toBeUndefined();
  });

  test("resolves relationship records by id", () => {
    expect(getPaperById("paper-ai-01")?.slug).toBe("demo-ai-01");
    expect(getTermsByIds(["term-ai-01", "term-ai-03"]).map((term) => term.id)).toEqual([
      "term-ai-01",
      "term-ai-03",
    ]);
  });

  test("contains no broken paper or term relationships", () => {
    expect(validateDemoRelationships()).toEqual([]);
  });
});
