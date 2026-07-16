import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import type { DiscoveryPaper } from "../../src/data/discovery-types";
import type { LibrarySnapshot } from "../../src/data/types";
import {
  createDiscoveryDecisionStore,
  discoveryPersonalizationAdjustment,
  filterAndSortDiscoveryPapers,
  scoreDiscoveryPaper,
  tierForScore,
} from "../../src/lib/discovery";
import {
  buildDiscoverySnapshot,
  mergeDiscoveryCandidates,
  parseArxivAtom,
  parseOpenReviewNotes,
  validateDiscoverySnapshotPapers,
  type Candidate,
} from "../../scripts/lib/discovery-refresh";
import library from "../../src/data/generated/library.json";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "tests", "fixtures", "discovery", name), "utf8");
const now = new Date("2026-07-16T03:30:00.000Z");

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  id: "arxiv:2607.01234",
  title: "DeskVLA: Vision Language Action Policies for Dexterous Manipulation",
  authors: ["Ada Robot"],
  abstract: "We evaluate a vision language action policy on a robot manipulation benchmark with improved success rate. ".repeat(4),
  publishedAt: "2026-07-10T09:00:00Z",
  arxivId: "2607.01234",
  categories: ["cs.RO"],
  topicIds: ["vision-language-action-models", "robot-manipulation"],
  sources: ["arxiv"],
  sourceUrl: "https://arxiv.org/abs/2607.01234",
  pdfUrl: "https://arxiv.org/pdf/2607.01234",
  artifacts: [{ kind: "pdf", url: "https://arxiv.org/pdf/2607.01234" }],
  ...overrides,
});

const paper = (overrides: Partial<DiscoveryPaper> = {}): DiscoveryPaper => {
  const base = candidate();
  return { ...base, score: scoreDiscoveryPaper(base, now), ...overrides };
};

describe("discovery source parsing and refresh", () => {
  test("parses arXiv Atom metadata and resources", () => {
    const [parsed] = parseArxivAtom(fixture("arxiv.xml"));
    expect(parsed).toMatchObject({ arxivId: "2607.01234", doi: "10.1234/deskvla", categories: ["cs.RO", "cs.AI"] });
    expect(parsed.authors).toEqual(["Ada Robot", "Lin World"]);
    expect(parsed.topicIds).toContain("vision-language-action-models");
    expect(parsed.artifacts.map((item) => item.kind)).toEqual(expect.arrayContaining(["code", "project", "pdf"]));
  });

  test("accepts decided OpenReview v2 records and rejects anonymous submissions", () => {
    const parsed = parseOpenReviewNotes(JSON.parse(fixture("openreview-v2.json")), "CoRL 2026");
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ id: "openreview:openreview-demo", venue: "CoRL 2026" });
  });

  test("parses legacy OpenReview v1 content fields", () => {
    const parsed = parseOpenReviewNotes({ notes: [{
      id: "legacy-demo",
      forum: "legacy-demo",
      pdate: 1780000000000,
      content: {
        title: "Legacy Accepted Robot Paper",
        authors: ["Ada Robot"],
        abstract: "An accepted manipulation benchmark paper.",
        venue: "ICLR 2024 Poster",
        pdf: "/pdf?id=legacy-demo",
      },
    }] }, "ICLR 2024");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].authors).toEqual(["Ada Robot"]);
  });

  test("deduplicates cross-source records by identity priority", () => {
    const merged = mergeDiscoveryCandidates([
      candidate(),
      candidate({ id: "s2:demo", arxivId: undefined, semanticScholarId: "demo", sources: ["semantic-scholar"], citationCount: 7 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toEqual(expect.arrayContaining(["arxiv", "semantic-scholar"]));
    expect(merged[0].semanticScholarId).toBe("demo");
  });

  test("keeps arXiv mandatory while degrading optional sources", async () => {
    const snapshot = await buildDiscoverySnapshot(library as LibrarySnapshot, undefined, {
      now,
      fetchArxiv: async () => [candidate()],
      fetchSemanticBatch: async () => { throw new Error("rate limited"); },
      fetchOpenReview: async () => { throw new Error("challenge"); },
    });
    expect(snapshot.meta.candidateCount).toBe(1);
    expect(snapshot.sources.arxiv.state).toBe("ok");
    expect(snapshot.sources["semantic-scholar"].state).toBe("degraded");
    expect(snapshot.sources.openreview.state).toBe("degraded");
    await expect(buildDiscoverySnapshot(library as LibrarySnapshot, undefined, { fetchArxiv: async () => [] })).rejects.toThrow(/arXiv returned no candidates/);
  });

  test("rejects duplicate snapshot identities", () => {
    expect(() => validateDiscoverySnapshotPapers([paper(), paper({ id: "duplicate" })])).toThrow(/Duplicate arXiv id/);
  });
});

describe("discovery scoring, search and feedback", () => {
  beforeEach(() => localStorage.clear());

  test("uses the documented score boundaries", () => {
    expect([44, 45, 59, 60, 74, 75].map(tierForScore)).toEqual(["archive", "track", "track", "skim", "skim", "priority"]);
  });

  test("does not penalize a new paper for zero citations", () => {
    const zero = scoreDiscoveryPaper(candidate({ citationCount: 0 }), now);
    const missing = scoreDiscoveryPaper(candidate({ citationCount: undefined }), now);
    expect(zero.evidence).toBe(missing.evidence);
    expect(zero.reasons).toContain("新论文不以零引用降权");
  });

  test("handles missing metadata and keeps scores bounded", () => {
    const result = scoreDiscoveryPaper(candidate({ authors: [], abstract: "", artifacts: [], pdfUrl: undefined, topicIds: [] }), now);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.completeness).toBeLessThan(6);
  });

  test("sorts keyword matches by text relevance before priority", () => {
    const titleMatch = paper({ title: "Dexterous Grasp Planning", score: { ...paper().score, total: 46 } });
    const abstractMatch = paper({ id: "arxiv:2607.09999", arxivId: "2607.09999", title: "General Robot Policy", abstract: "dexterous grasp planning ".repeat(20), score: { ...paper().score, total: 90 } });
    expect(filterAndSortDiscoveryPapers([abstractMatch, titleMatch], { query: "dexterous grasp" }, now)[0].title).toBe(titleMatch.title);
  });

  test("persists decisions and caps shared-topic feedback at eight points", () => {
    const store = createDiscoveryDecisionStore(localStorage);
    for (let index = 0; index < 6; index += 1) store.set(`queued-${index}`, "queued");
    const decisions = store.all();
    const map = new Map(Object.keys(decisions).map((id) => [id, { topicIds: ["robot-manipulation" as const] }]));
    expect(createDiscoveryDecisionStore(localStorage).get("queued-0")).toBe("queued");
    expect(discoveryPersonalizationAdjustment({ id: "target", topicIds: ["robot-manipulation"] }, map, decisions)).toBe(8);
  });
});
