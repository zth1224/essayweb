import { describe, expect, test } from "vitest";
import snapshot from "../../src/data/generated/discovery.json";
import aiSnapshot from "../../src/data/generated/discovery-cs-ai.json";
import clSnapshot from "../../src/data/generated/discovery-cs-cl.json";
import cvSnapshot from "../../src/data/generated/discovery-cs-cv.json";
import lgSnapshot from "../../src/data/generated/discovery-cs-lg.json";
import index from "../../src/data/generated/discovery-index.json";
import { normalizeDiscoveryTitle } from "../../src/lib/discovery";

describe("generated discovery snapshot", () => {
  test("is internally consistent and privacy-safe", () => {
    const snapshots = [snapshot, aiSnapshot, clSnapshot, cvSnapshot, lgSnapshot];
    expect(index.fields).toHaveLength(5);
    expect(new Set(snapshots.map((item) => item.fieldId)).size).toBe(5);
    for (const item of snapshots) {
      expect(item.schemaVersion).toBe(2);
      expect(item.papers).toHaveLength(item.meta.candidateCount);
      expect(item.papers.length).toBeLessThanOrEqual(item.candidateCap);
      expect(item.sources.arxiv.state).toBe("ok");
      expect(new Set(item.papers.map((paper) => paper.id)).size).toBe(item.papers.length);
      expect(new Set(item.papers.map((paper) => normalizeDiscoveryTitle(paper.title))).size).toBe(item.papers.length);
      expect(item.papers.every((paper) => paper.fieldIds.includes(item.fieldId))).toBe(true);
      expect(item.papers.every((paper) => paper.score.total >= 0 && paper.score.total <= 100)).toBe(true);
      expect(JSON.stringify(item)).not.toMatch(/[A-Z]:\\\\(?:Users|essay|Documents)/i);
    }
  });
});
