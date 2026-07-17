import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import type { DiscoveryPaper } from "../../src/data/discovery-types";
import type { LibrarySnapshot } from "../../src/data/types";
import {
  balanceDiscoveryAgeBands,
  classifyDiscoveryFields,
  classifyDiscoveryTopics,
  createDiscoveryDecisionStore,
  discoveryTopicsForField,
  discoveryPersonalizationAdjustment,
  filterAndSortDiscoveryPapers,
  isFormalDiscoveryVenue,
  scoreDiscoveryPaper,
  selectDiscoveryFeatured,
  tierForScore,
} from "../../src/lib/discovery";
import {
  buildDiscoverySnapshot,
  buildDiscoverySnapshots,
  buildArxivQueries,
  meetsDiscoveryRetention,
  mergeDiscoveryCandidates,
  parseArxivAtom,
  parseOpenReviewNotes,
  selectSeedArxivIds,
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
  fieldIds: ["embodied-intelligence"],
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
  test("builds explicit arXiv time slices for the two-year window", () => {
    const queries = buildArxivQueries("embodied-intelligence", now);
    expect(queries).toHaveLength(3);
    expect(queries[1].query).toContain("submittedDate:[202507160330 TO 202601160330]");
    expect(queries[2].query).toContain("submittedDate:[202407160330 TO 202507150330]");
    expect(queries[1].sortBy).toBe("relevance");
    expect(queries[2].sortBy).toBe("relevance");
  });

  test("builds core-topic queries for all five research fields", () => {
    expect(buildArxivQueries("cs-ai", now)[0].query).toContain("cat:cs.AI");
    expect(buildArxivQueries("cs-cl", now)[0].query).toContain("cat:cs.CL");
    expect(buildArxivQueries("cs-cv", now)[0].query).toContain("cat:cs.CV");
    expect(buildArxivQueries("cs-lg", now)[0].query).toContain("cat:stat.ML");
    expect(buildArxivQueries("embodied-intelligence", now)[0].query).toContain("cat:cs.RO");
  });

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

  test("builds isolated snapshots for all fields from fixed candidates", async () => {
    const fieldTopics = {
      "embodied-intelligence": "robot-manipulation",
      "cs-ai": "ai-reasoning-planning",
      "cs-cl": "cl-language-modeling",
      "cs-cv": "cv-representation-recognition",
      "cs-lg": "lg-theory-optimization",
    } as const;
    const snapshots = await buildDiscoverySnapshots(library as LibrarySnapshot, {}, {
      now,
      fetchArxiv: async (fieldId) => [candidate({
        id: `arxiv:${fieldId}`,
        arxivId: fieldId,
        title: `${fieldId} benchmark paper`,
        fieldIds: [fieldId],
        topicIds: [fieldTopics[fieldId]],
      })],
      fetchSemanticBatch: async () => [],
      fetchOpenReview: async () => [],
    });
    expect(Object.values(snapshots)).toHaveLength(5);
    expect(snapshots["cs-cl"]?.papers[0].fieldIds).toContain("cs-cl");
    expect(snapshots["cs-cl"]?.schemaVersion).toBe(2);
  });
});

describe("discovery scoring, search and feedback", () => {
  beforeEach(() => localStorage.clear());

  test("uses the documented score boundaries", () => {
    expect([44, 45, 59, 60, 74, 75].map(tierForScore)).toEqual(["archive", "track", "track", "skim", "skim", "priority"]);
  });

  test("classifies field-scoped core topics and allows multi-field papers", () => {
    expect(discoveryTopicsForField("cs-ai")).toHaveLength(5);
    expect(discoveryTopicsForField("cs-cl")).toHaveLength(5);
    const topics = classifyDiscoveryTopics("A multilingual vision-language model for question answering and video understanding");
    expect(topics).toEqual(expect.arrayContaining(["cl-language-modeling", "cl-retrieval-question-answering", "cl-multilingual-translation", "cv-video-understanding", "cv-vision-language-multimodal"]));
    expect(classifyDiscoveryFields(["cs.CL", "cs.CV"], topics)).toEqual(expect.arrayContaining(["cs-cl", "cs-cv"]));
  });

  test("uses explicit field and topic points without inflating cold-start scores", () => {
    const coldStart = scoreDiscoveryPaper(candidate({
      fieldIds: ["cs-ai"],
      topicIds: ["ai-reasoning-planning"],
      recommendationRank: undefined,
      recommendationRanks: undefined,
    }), now, "cs-ai");
    const recommended = scoreDiscoveryPaper(candidate({
      fieldIds: ["cs-ai"],
      topicIds: ["ai-reasoning-planning", "ai-agents-tool-use"],
      recommendationRanks: { "cs-ai": 1 },
    }), now, "cs-ai");
    expect(coldStart.interest).toBe(24);
    expect(recommended.interest).toBe(42);
  });

  test("recognizes formal venues within their research field", () => {
    expect(isFormalDiscoveryVenue("Findings of ACL 2026", "cs-cl")).toBe(true);
    expect(isFormalDiscoveryVenue("CVPR 2026", "cs-cv")).toBe(true);
    expect(isFormalDiscoveryVenue("AAAI 2026", "cs-lg")).toBe(false);
    expect(isFormalDiscoveryVenue("CoRL 2026", "embodied-intelligence")).toBe(true);
  });

  test("only exposes recommendation seeds already read in that field", () => {
    expect(selectSeedArxivIds(library as LibrarySnapshot, "embodied-intelligence").length).toBeGreaterThanOrEqual(5);
    expect(selectSeedArxivIds(library as LibrarySnapshot, "cs-lg")).toHaveLength(0);
  });

  test("does not penalize a new paper for zero citations", () => {
    const zero = scoreDiscoveryPaper(candidate({ citationCount: 0 }), now);
    const missing = scoreDiscoveryPaper(candidate({ citationCount: undefined }), now);
    expect(zero.evidence).toBe(missing.evidence);
    expect(zero.reasons).toContain("新论文不以零引用降权");
  });

  test("scores reproducibility and explicit experiments as evidence maturity", () => {
    const result = scoreDiscoveryPaper(candidate({
      abstract: "Experiments on a benchmark outperform three baselines by 42%. An ablation study validates each component.",
      artifacts: [
        { kind: "code", url: "https://github.com/example/deskvla" },
        { kind: "project", url: "https://example.org/deskvla" },
        { kind: "pdf", url: "https://arxiv.org/pdf/2607.01234" },
      ],
    }), now);
    expect(result.evidence).toBe(13);
    expect(result.reasons).toContain("包含明确的量化与对比实验");
  });

  test("applies a stricter maturity gate after 180 days", () => {
    const recent = paper({ publishedAt: "2026-03-01T00:00:00Z", score: { ...paper().score, total: 40, evidence: 2 } });
    const olderWeak = paper({ publishedAt: "2025-07-16T00:00:00Z", score: { ...paper().score, interest: 20, evidence: 7, completeness: 13 } });
    const olderMature = paper({ publishedAt: "2025-07-16T00:00:00Z", score: { ...paper().score, interest: 9, evidence: 8, completeness: 11 } });
    const expired = paper({ publishedAt: "2024-07-15T00:00:00Z", score: { ...paper().score, total: 90, evidence: 20 } });
    expect(meetsDiscoveryRetention(recent, now)).toBe(true);
    expect(meetsDiscoveryRetention(olderWeak, now)).toBe(false);
    expect(meetsDiscoveryRetention(olderMature, now)).toBe(true);
    expect(meetsDiscoveryRetention(expired, now)).toBe(false);
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

  test("interleaves one recent paper with two older papers", () => {
    const recentA = paper({ id: "recent-a", arxivId: "recent-a", publishedAt: "2026-07-01" });
    const recentB = paper({ id: "recent-b", arxivId: "recent-b", publishedAt: "2026-06-01" });
    const olderA = paper({ id: "older-a", arxivId: "older-a", publishedAt: "2025-12-01" });
    const olderB = paper({ id: "older-b", arxivId: "older-b", publishedAt: "2025-11-01" });
    const olderC = paper({ id: "older-c", arxivId: "older-c", publishedAt: "2025-10-01" });
    const ordered = balanceDiscoveryAgeBands([recentA, recentB, olderA, olderB, olderC], now);
    expect(ordered.map((item) => item.id)).toEqual(["recent-a", "older-a", "older-b", "recent-b", "older-c"]);
  });

  test("does not pad the daily brief from the wrong age band", () => {
    const recent = [
      paper({ id: "recent-a", arxivId: "recent-a", publishedAt: "2026-07-01" }),
      paper({ id: "recent-b", arxivId: "recent-b", publishedAt: "2026-06-01" }),
    ];
    expect(selectDiscoveryFeatured(recent, now).map((item) => item.id)).toEqual(["recent-a"]);
  });

  test("filters an explicit inclusive publication date range", () => {
    const recent = paper({ id: "recent", arxivId: "recent", publishedAt: "2026-07-01" });
    const older = paper({ id: "older", arxivId: "older", publishedAt: "2025-11-15" });
    expect(filterAndSortDiscoveryPapers([recent, older], { dateFrom: "2025-11-01", dateTo: "2025-11-30" }, now).map((item) => item.id)).toEqual(["older"]);
  });

  test("decays freshness smoothly across the two-year window", () => {
    const atSixMonths = scoreDiscoveryPaper(candidate({ publishedAt: "2026-01-17" }), now);
    const nearTwoYears = scoreDiscoveryPaper(candidate({ publishedAt: "2024-07-17" }), now);
    expect(atSixMonths.freshness).toBeGreaterThan(0);
    expect(nearTwoYears.freshness).toBe(0);
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
