import { describe, expect, test } from "vitest";
import snapshot from "../../src/data/generated/discovery.json";
import { normalizeDiscoveryTitle } from "../../src/lib/discovery";

describe("generated discovery snapshot", () => {
  test("is internally consistent and privacy-safe", () => {
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.papers).toHaveLength(snapshot.meta.candidateCount);
    expect(snapshot.papers.length).toBeLessThanOrEqual(snapshot.candidateCap);
    expect(snapshot.meta.featuredCount).toBeGreaterThan(0);
    expect(snapshot.sources.arxiv.state).toBe("ok");
    expect(new Set(snapshot.papers.map((paper) => paper.id)).size).toBe(snapshot.papers.length);
    expect(new Set(snapshot.papers.map((paper) => normalizeDiscoveryTitle(paper.title))).size).toBe(snapshot.papers.length);
    expect(snapshot.papers.every((paper) => paper.score.total >= 0 && paper.score.total <= 100)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(/[A-Z]:\\\\(?:Users|essay|Documents)/i);
  });
});
