import { describe, expect, test } from "vitest";
import snapshot from "../../src/data/generated/library.json";
import { fields } from "../../src/data/fields";
import {
  getFieldBySlug,
  getPaperById,
  getPaperBySlug,
  getPapersByField,
  getTermsByIds,
  getTermsByField,
  getLibraryMeta,
  getTopicsByField,
  validateLibraryRelationships,
} from "../../src/data/repository";

describe("essay knowledge model", () => {
  test("defines five unique research fields", () => {
    expect(fields).toHaveLength(5);
    expect(new Set(fields.map((field) => field.id)).size).toBe(5);
    expect(new Set(fields.map((field) => field.slug)).size).toBe(5);
    expect(new Set(fields.map((field) => field.accent)).size).toBe(5);
  });

  test("publishes the verified embodied snapshot and leaves other fields empty", () => {
    expect(getLibraryMeta()).toMatchObject({ paperCount: 210, topicCount: 7, termCount: 497, damagedPaperCount: 7, readPaperCount: 47 });
    expect(getPapersByField("embodied-intelligence")).toHaveLength(210);
    expect(getTermsByField("embodied-intelligence")).toHaveLength(497);
    expect(getTopicsByField("embodied-intelligence")).toHaveLength(7);
    for (const field of fields.filter((item) => item.id !== "embodied-intelligence")) {
      expect(getPapersByField(field.id)).toHaveLength(0);
      expect(getTermsByField(field.id)).toHaveLength(0);
    }
  });

  test("resolves routes by slug", () => {
    expect(getFieldBySlug("artificial-intelligence")?.id).toBe("cs-ai");
    expect(getPaperBySlug("2025-pi-star-0-6-vla-learns-from-experience")?.sourceNumber).toBe(168);
    expect(getPaperBySlug("missing-paper")).toBeUndefined();
  });

  test("resolves relationship records by id", () => {
    const paper = getPaperBySlug("2025-pi-star-0-6-vla-learns-from-experience")!;
    expect(getPaperById(paper.id)?.slug).toBe(paper.slug);
    expect(getTermsByIds(paper.termIds)).toHaveLength(paper.termIds.length);
  });

  test("contains no broken paper or term relationships", () => {
    expect(validateLibraryRelationships()).toEqual([]);
  });

  test("does not publish damaged text or local source paths", () => {
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("????");
    expect(serialized).not.toMatch(/D:\\essay/i);
    expect(serialized).not.toContain('"pdfUrl":"pdfs/');
    expect(snapshot.papers.filter((paper) => paper.contentState === "source-damaged")).toHaveLength(7);
  });
});
