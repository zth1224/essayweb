import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { DiscoveryPaper } from "../../src/data/discovery-types";
import type { LibrarySnapshot } from "../../src/data/types";
import {
  balanceDiscoveryAgeBands,
  classifyDiscoveryPublication,
  classifyDiscoveryFields,
  classifyDiscoveryTopics,
  createDiscoveryDecisionStore,
  discoveryTopicsForField,
  discoveryPersonalizationAdjustment,
  filterAndSortDiscoveryPapers,
  isFormalDiscoveryVenue,
  scoreDiscoveryPaper,
  semanticRecommendationBoost,
  selectDiscoveryFeatured,
  tierForDiscoveryScore,
} from "../../src/lib/discovery";
import {
  buildDiscoverySnapshot,
  buildDiscoverySnapshots,
  buildArxivQueries,
  fetchWithRetry,
  meetsDiscoveryRetention,
  mergeDiscoveryCandidates,
  parseArxivAtom,
  parseOpenReviewNotes,
  selectSeedArxivIds,
  upgradeDiscoverySnapshot,
  validateDiscoverySnapshotPapers,
  type Candidate,
  type LegacyDiscoverySnapshot,
} from "../../scripts/lib/discovery-refresh";
import library from "../../src/data/generated/library.json";

const fixture = (name: string) => readFileSync(resolve(process.cwd(), "tests", "fixtures", "discovery", name), "utf8");
const now = new Date("2026-07-16T03:30:00.000Z");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

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
  const publication = classifyDiscoveryPublication(base, "embodied-intelligence");
  const enriched = { ...base, canonicalVenueId: publication.canonicalVenueId, publicationStatus: publication.publicationStatus, personalization: {} };
  return { ...enriched, score: scoreDiscoveryPaper(enriched, now), ...overrides };
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
    expect(buildArxivQueries("embodied-intelligence", now)[0].query).not.toContain("cat:cs.AI");
    for (const fieldId of ["embodied-intelligence", "cs-ai", "cs-cl", "cs-cv", "cs-lg"] as const) {
      expect(buildArxivQueries(fieldId, now).every(({ query }) => !query.includes("all:"))).toBe(true);
    }
  });

  test("honors Retry-After before retrying a rate-limited source", async () => {
    const wait = vi.fn(async () => undefined);
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "retry-after": "7" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const response = await fetchWithRetry("https://example.test/papers", {}, {
      attempts: 2,
      baseDelayMs: 1_000,
      jitterMs: 0,
      wait,
    });

    expect(await response.text()).toBe("ok");
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(7_000);
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

  test("preserves prior Semantic Scholar evidence when enrichment is degraded", async () => {
    const aiCandidate = candidate({
      title: "Reasoning and Planning Benchmark for AI Agents",
      fieldIds: ["cs-ai"],
      topicIds: ["ai-reasoning-planning", "ai-agents-tool-use"],
      categories: ["cs.AI"],
    });
    const prior = await buildDiscoverySnapshot(library as LibrarySnapshot, undefined, {
      now,
      fieldId: "cs-ai",
      fetchArxiv: async () => [aiCandidate],
      fetchSemanticBatch: async () => [{
        paperId: "semantic-demo",
        externalIds: { ArXiv: "2607.01234", DOI: "10.1234/demo" },
        title: aiCandidate.title,
        abstract: aiCandidate.abstract,
        venue: "AAAI Conference on Artificial Intelligence",
        publicationDate: aiCandidate.publishedAt,
        citationCount: 12,
        authors: [{ name: "Ada Robot" }],
      }],
      fetchOpenReview: async () => [],
    });
    const degraded = await buildDiscoverySnapshot(library as LibrarySnapshot, prior, {
      now,
      fieldId: "cs-ai",
      fetchArxiv: async () => [aiCandidate],
      fetchSemanticBatch: async () => { throw new Error("rate limited"); },
      fetchOpenReview: async () => [],
    });
    expect(degraded.sources["semantic-scholar"].state).toBe("degraded");
    expect(degraded.papers[0].venue).toBe("AAAI Conference on Artificial Intelligence");
    expect(degraded.papers[0].publicationStatus).toBe("core");
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
      fetchArxiv: async (fieldId) => [
        candidate({
          id: `arxiv:${fieldId}`,
          arxivId: fieldId,
          title: `${fieldId} benchmark paper`,
          fieldIds: [fieldId],
          topicIds: [fieldTopics[fieldId]],
        }),
        ...(fieldId === "cs-ai" ? [candidate({
          id: "arxiv:cross-field-robot-agent",
          arxivId: "cross-field-robot-agent",
          title: "Robot Agent Planning Benchmark",
          categories: ["cs.AI"],
          fieldIds: ["cs-ai", "embodied-intelligence"],
          topicIds: ["ai-agents-tool-use", "robot-manipulation"],
        })] : []),
      ],
      fetchSemanticBatch: async () => [],
      fetchOpenReview: async () => [],
    });
    expect(Object.values(snapshots)).toHaveLength(5);
    expect(snapshots["cs-cl"]?.papers[0].fieldIds).toContain("cs-cl");
    expect(snapshots["cs-cl"]?.schemaVersion).toBe(3);
    expect(snapshots["embodied-intelligence"]?.papers.some((item) => item.id === "arxiv:cross-field-robot-agent")).toBe(true);
  });

  test("migrates v2 scores deterministically and drops legacy recommendation fallback", () => {
    const legacy = {
      schemaVersion: 2,
      fieldId: "cs-ai",
      generatedAt: now.toISOString(),
      retainedDays: 730,
      candidateCap: 2_000,
      papers: [{
        ...candidate({ fieldIds: ["cs-ai"], topicIds: ["ai-reasoning-planning"], recommendationRanks: { "embodied-intelligence": 1 } }),
        recommendationRank: 1,
        score: { total: 99, interest: 45 },
      }],
      sources: {
        arxiv: { state: "ok", fetchedAt: now.toISOString(), recordCount: 1 },
        "semantic-scholar": { state: "ok", fetchedAt: now.toISOString(), recordCount: 0 },
        openreview: { state: "degraded", fetchedAt: now.toISOString(), recordCount: 0 },
      },
      meta: { candidateCount: 1, featuredCount: 1, libraryMatchCount: 0, seedCount: 0 },
    } as LegacyDiscoverySnapshot;
    const upgraded = upgradeDiscoverySnapshot(legacy, "cs-ai");
    expect(upgraded.schemaVersion).toBe(3);
    expect(upgraded.meta.scoreVersion).toBe("reading-priority-v3");
    expect(upgraded.papers[0].score.relevance).toBe(24);
    expect(upgraded.papers[0].personalization).toEqual({});
    expect(upgraded.papers[0].recommendationRanks).toBeUndefined();
  });
});

describe("discovery scoring, search and feedback", () => {
  beforeEach(() => localStorage.clear());

  test("uses strict total and evidence gates for reading tiers", () => {
    const tier = (baseTotal: number, evidence: number, ageDays = 10) => tierForDiscoveryScore({ baseTotal, evidence, relevance: 24, completeness: 12 }, ageDays);
    expect(tier(44, 30)).toBe("archive");
    expect(tier(45, 0)).toBe("track");
    expect(tier(60, 10)).toBe("skim");
    expect(tier(70, 15)).toBe("skim");
    expect(tier(70, 16)).toBe("priority");
    expect(tier(70, 19, 181)).toBe("skim");
    expect(tier(70, 20, 181)).toBe("priority");
  });

  test("classifies field-scoped core topics and allows multi-field papers", () => {
    expect(discoveryTopicsForField("cs-ai")).toHaveLength(5);
    expect(discoveryTopicsForField("cs-cl")).toHaveLength(5);
    const topics = classifyDiscoveryTopics("A multilingual vision-language model for question answering and video understanding");
    expect(topics).toEqual(expect.arrayContaining(["cl-language-modeling", "cl-retrieval-question-answering", "cl-multilingual-translation", "cv-video-understanding", "cv-vision-language-multimodal"]));
    expect(classifyDiscoveryFields(["cs.CL", "cs.CV"], topics)).toEqual(expect.arrayContaining(["cs-cl", "cs-cv"]));
  });

  test("keeps recommendation outside the cold-start base score", () => {
    const coldStart = scoreDiscoveryPaper(candidate({
      fieldIds: ["cs-ai"],
      topicIds: ["ai-reasoning-planning"],
      recommendationRanks: undefined,
    }), now, "cs-ai");
    const recommended = scoreDiscoveryPaper(candidate({
      fieldIds: ["cs-ai"],
      topicIds: ["ai-reasoning-planning", "ai-agents-tool-use"],
      recommendationRanks: { "cs-ai": 1 },
    }), now, "cs-ai");
    expect(coldStart.relevance).toBe(24);
    expect(recommended.relevance).toBe(27);
    expect(semanticRecommendationBoost(1)).toBe(15);
  });

  test("does not leak an embodied recommendation into another field", async () => {
    const snapshot = await buildDiscoverySnapshot(library as LibrarySnapshot, undefined, {
      now,
      fieldId: "cs-ai",
      fetchArxiv: async () => [candidate({
        fieldIds: ["cs-ai"],
        topicIds: ["ai-reasoning-planning"],
        recommendationRanks: { "embodied-intelligence": 1 },
      })],
      fetchSemanticBatch: async () => [],
      fetchOpenReview: async () => [],
    });
    expect(snapshot.papers[0].personalization).toEqual({});
    expect(snapshot.papers[0].recommendationRanks).toBeUndefined();
  });

  test("recognizes formal venues within their research field", () => {
    expect(isFormalDiscoveryVenue("Findings of ACL 2026", "cs-cl")).toBe(true);
    expect(isFormalDiscoveryVenue("CVPR 2026", "cs-cv")).toBe(true);
    expect(isFormalDiscoveryVenue("Computer Vision and Pattern Recognition", "cs-cv")).toBe(true);
    expect(isFormalDiscoveryVenue("Neural Information Processing Systems", "cs-lg")).toBe(true);
    expect(isFormalDiscoveryVenue("IEEE International Conference on Robotics and Automation", "embodied-intelligence")).toBe(true);
    expect(isFormalDiscoveryVenue("Annual Meeting of the Association for Computational Linguistics", "cs-cl")).toBe(true);
    expect(isFormalDiscoveryVenue("AAAI 2026", "cs-lg")).toBe(false);
    expect(isFormalDiscoveryVenue("CoRL 2026", "embodied-intelligence")).toBe(true);
    expect(isFormalDiscoveryVenue("CVPR 2026 Workshop", "cs-cv")).toBe(false);
  });

  test("distinguishes core, cross-field, DOI and unverified publication evidence", () => {
    expect(classifyDiscoveryPublication(candidate({ venue: "AAAI Conference on Artificial Intelligence" }), "cs-ai").publicationStatus).toBe("core");
    expect(classifyDiscoveryPublication(candidate({ venue: "AAAI Conference on Artificial Intelligence" }), "cs-lg").publicationStatus).toBe("formal");
    expect(classifyDiscoveryPublication(candidate({ venue: "Journal of Useful Results", doi: "10.1/demo" }), "cs-ai").publicationStatus).toBe("formal");
    expect(classifyDiscoveryPublication(candidate({ venue: "Unknown Symposium" }), "cs-ai").publicationStatus).toBe("unverified");
  });

  test("only exposes recommendation seeds already read in that field", () => {
    expect(selectSeedArxivIds(library as LibrarySnapshot, "embodied-intelligence").length).toBeGreaterThanOrEqual(5);
    expect(selectSeedArxivIds(library as LibrarySnapshot, "cs-lg")).toHaveLength(0);
  });

  test("does not penalize a new paper for zero citations", () => {
    const zero = scoreDiscoveryPaper(candidate({ citationCount: 0 }), now);
    const missing = scoreDiscoveryPaper(candidate({ citationCount: undefined }), now);
    expect(zero.evidence).toBe(missing.evidence);
    expect(zero.reasons).toContain("新论文不因零引用降权");
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
    expect(result.evidenceBreakdown.reproducibility).toBe(6);
    expect(result.evidenceBreakdown.empirical).toBeGreaterThanOrEqual(8);
    expect(result.reasons).toContain("包含明确的量化、对比或消融实验");
  });

  test("applies a stricter maturity gate after 180 days", () => {
    const recent = paper({ publishedAt: "2026-03-01T00:00:00Z", score: { ...paper().score, baseTotal: 40, evidence: 2 } });
    const olderWeak = paper({ publishedAt: "2025-07-16T00:00:00Z", score: { ...paper().score, relevance: 24, evidence: 13, completeness: 12 } });
    const olderMature = paper({ publishedAt: "2025-07-16T00:00:00Z", score: { ...paper().score, relevance: 24, evidence: 14, completeness: 12 } });
    const expired = paper({ publishedAt: "2024-07-15T00:00:00Z", score: { ...paper().score, baseTotal: 90, evidence: 20 } });
    expect(meetsDiscoveryRetention(recent, now)).toBe(true);
    expect(meetsDiscoveryRetention(olderWeak, now)).toBe(false);
    expect(meetsDiscoveryRetention(olderMature, now)).toBe(true);
    expect(meetsDiscoveryRetention(expired, now)).toBe(false);
  });

  test("handles missing metadata and keeps scores bounded", () => {
    const result = scoreDiscoveryPaper(candidate({ authors: [], abstract: "", artifacts: [], pdfUrl: undefined, topicIds: [] }), now);
    expect(result.baseTotal).toBeGreaterThanOrEqual(0);
    expect(result.baseTotal).toBeLessThanOrEqual(100);
    expect(result.completeness).toBeLessThan(6);
  });

  test("sorts keyword matches by text relevance before priority", () => {
    const titleMatch = paper({ title: "Dexterous Grasp Planning", score: { ...paper().score, baseTotal: 46 } });
    const abstractMatch = paper({ id: "arxiv:2607.09999", arxivId: "2607.09999", title: "General Robot Policy", abstract: "dexterous grasp planning ".repeat(20), score: { ...paper().score, baseTotal: 90 } });
    expect(filterAndSortDiscoveryPapers([abstractMatch, titleMatch], { query: "dexterous grasp" }, now)[0].title).toBe(titleMatch.title);
  });

  test("keeps tiers ahead of personalization and reranks only within a tier", () => {
    const priority = paper({ id: "priority", arxivId: "priority", score: { ...paper().score, baseTotal: 70, tier: "priority" }, personalization: {} });
    const boostedSkim = paper({ id: "boosted-skim", arxivId: "boosted-skim", score: { ...paper().score, baseTotal: 69, tier: "skim" }, personalization: { semanticRank: 1, semanticBoost: 15 } });
    const boostedPriority = paper({ id: "boosted-priority", arxivId: "boosted-priority", score: { ...paper().score, baseTotal: 68, tier: "priority" }, personalization: { semanticRank: 1, semanticBoost: 15 } });
    expect(filterAndSortDiscoveryPapers([boostedSkim, priority], {}, now)[0].id).toBe("priority");
    expect(filterAndSortDiscoveryPapers([priority, boostedPriority], {}, now)[0].id).toBe("boosted-priority");
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
