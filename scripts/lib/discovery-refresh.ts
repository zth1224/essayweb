import type {
  DiscoveryArtifact,
  DiscoveryPaper,
  DiscoverySnapshot,
  DiscoverySource,
  DiscoverySourceStatus,
  DiscoveryTopicId,
} from "../../src/data/discovery-types";
import type { LibrarySnapshot, PaperRecord } from "../../src/data/types";
import {
  classifyDiscoveryTopics,
  normalizeDiscoveryTitle,
  scoreDiscoveryPaper,
} from "../../src/lib/discovery";

export const RETAINED_DAYS = 730;
export const STRICT_AGE_DAYS = 180;
export const STRICT_MIN_INTEREST = 9;
export const STRICT_MIN_EVIDENCE = 8;
export const STRICT_MIN_COMPLETENESS = 11;
export const CANDIDATE_CAP = 2_000;

export type Candidate = Omit<DiscoveryPaper, "score">;

interface SemanticScholarPaper {
  paperId?: string;
  externalIds?: { ArXiv?: string; DOI?: string };
  url?: string;
  title?: string;
  abstract?: string | null;
  venue?: string;
  publicationDate?: string | null;
  year?: number;
  citationCount?: number;
  influentialCitationCount?: number;
  openAccessPdf?: { url?: string } | null;
  authors?: Array<{ name?: string }>;
}

const decodeXml = (value: string) => value
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));

const cleanXmlText = (value: string) => decodeXml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

const firstTag = (xml: string, tag: string) => {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? cleanXmlText(match[1]) : "";
};

const allTagBlocks = (xml: string, tag: string) =>
  [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((match) => match[1]);

const normalizeArxivId = (value = "") => value
  .replace(/^.*\/(?:abs|pdf)\//i, "")
  .replace(/\.pdf$/i, "")
  .replace(/v\d+$/i, "")
  .trim();

const unique = <T>(values: T[]) => [...new Set(values)];

const extractArtifacts = (text: string, pdfUrl?: string): DiscoveryArtifact[] => {
  const urls = [...text.matchAll(/https?:\/\/[^\s<>()\]]+/gi)].map((match) => match[0].replace(/[.,;:]$/, ""));
  const artifacts: DiscoveryArtifact[] = urls.map((url) => ({
    kind: /github\.com|gitlab\.com|gitee\.com/i.test(url)
      ? "code"
      : /huggingface\.co\/datasets\/|kaggle\.com\/datasets\/|zenodo\.org\/records?\//i.test(url)
        ? "dataset"
        : /huggingface\.co\/(?!datasets\/)[^/]+\/[^/]+/i.test(url)
          ? "model"
          : "project",
    url,
  }));
  if (pdfUrl) artifacts.push({ kind: "pdf", url: pdfUrl });
  return artifacts.filter((artifact, index, items) => items.findIndex((item) => item.url === artifact.url) === index);
};

export const parseArxivAtom = (xml: string): Candidate[] => {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].map((match) => match[1]);
  return entries.map((entry): Candidate => {
    const sourceUrl = firstTag(entry, "id");
    const arxivId = normalizeArxivId(sourceUrl);
    const title = firstTag(entry, "title");
    const abstract = firstTag(entry, "summary");
    const authors = allTagBlocks(entry, "author").map((block) => firstTag(block, "name")).filter(Boolean);
    const publishedAt = firstTag(entry, "published");
    const updatedAt = firstTag(entry, "updated");
    const doi = firstTag(entry, "arxiv:doi") || undefined;
    const comment = firstTag(entry, "arxiv:comment");
    const categories = [...entry.matchAll(/<category\b[^>]*\bterm=["']([^"']+)["'][^>]*\/?\s*>/gi)].map((match) => decodeXml(match[1]));
    const pdfUrl = [...entry.matchAll(/<link\b([^>]+)>/gi)]
      .map((match) => match[1])
      .find((attributes) => /title=["']pdf["']/i.test(attributes))
      ?.match(/href=["']([^"']+)["']/i)?.[1];
    const topicIds = classifyDiscoveryTopics(`${title} ${abstract} ${categories.join(" ")}`);
    return {
      id: `arxiv:${arxivId}`,
      title,
      authors,
      abstract,
      publishedAt,
      updatedAt: updatedAt || undefined,
      arxivId,
      doi,
      categories: unique(categories),
      topicIds,
      sources: ["arxiv"],
      sourceUrl,
      pdfUrl,
      artifacts: extractArtifacts(`${comment} ${abstract}`, pdfUrl),
    };
  }).filter((paper) => paper.arxivId && paper.title && paper.publishedAt);
};

const candidateFromSemanticScholar = (paper: SemanticScholarPaper, recommendationRank?: number): Candidate | undefined => {
  const title = paper.title?.trim() ?? "";
  const publishedAt = paper.publicationDate ?? (paper.year ? `${paper.year}-01-01` : "");
  if (!paper.paperId || !title || !publishedAt) return undefined;
  const arxivId = normalizeArxivId(paper.externalIds?.ArXiv);
  const pdfUrl = paper.openAccessPdf?.url || (arxivId ? `https://arxiv.org/pdf/${arxivId}` : undefined);
  const sourceUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : (paper.url ?? `https://www.semanticscholar.org/paper/${paper.paperId}`);
  const semanticVenue = paper.venue?.trim();
  return {
    id: arxivId ? `arxiv:${arxivId}` : `s2:${paper.paperId}`,
    title,
    authors: paper.authors?.map((author) => author.name?.trim()).filter((name): name is string => Boolean(name)) ?? [],
    abstract: paper.abstract?.trim() ?? "",
    publishedAt,
    arxivId: arxivId || undefined,
    doi: paper.externalIds?.DOI,
    semanticScholarId: paper.paperId,
    categories: [],
    topicIds: classifyDiscoveryTopics(`${title} ${paper.abstract ?? ""}`),
    sources: ["semantic-scholar"],
    sourceUrl,
    pdfUrl,
    venue: semanticVenue && !/^arxiv(?:\.org)?$/i.test(semanticVenue) ? semanticVenue : undefined,
    citationCount: paper.citationCount,
    influentialCitationCount: paper.influentialCitationCount,
    recommendationRank,
    artifacts: extractArtifacts(paper.abstract ?? "", pdfUrl),
  };
};

const contentValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) return contentValue((value as { value: unknown }).value);
  if (Array.isArray(value)) return value.map(contentValue).filter(Boolean).join(", ");
  return "";
};

export const parseOpenReviewNotes = (payload: unknown, venue: string): Candidate[] => {
  if (!payload || typeof payload !== "object" || !("notes" in payload) || !Array.isArray((payload as { notes: unknown }).notes)) return [];
  return (payload as { notes: Array<Record<string, unknown>> }).notes.flatMap((note): Candidate[] => {
    const content = (note.content && typeof note.content === "object" ? note.content : {}) as Record<string, unknown>;
    const title = contentValue(content.title);
    const abstract = contentValue(content.abstract);
    const authors = Array.isArray(content.authors)
      ? content.authors.map(contentValue).filter(Boolean)
      : contentValue(content.authors).split(/,\s*/).filter(Boolean);
    const decisionLabel = contentValue(content.venueid) || contentValue(content.venue);
    const openReviewId = typeof note.forum === "string" ? note.forum : (typeof note.id === "string" ? note.id : "");
    const pdfPath = contentValue(content.pdf);
    const pdfUrl = pdfPath ? new URL(pdfPath, "https://openreview.net").toString() : undefined;
    const publishedAt = typeof note.pdate === "number"
      ? new Date(note.pdate).toISOString()
      : typeof note.cdate === "number" ? new Date(note.cdate).toISOString() : "";
    const isAnonymous = authors.length === 0 || authors.some((author) => /anonymous/i.test(author)) || /anonymous submission/i.test(title);
    const isUndecided = /submitted|under review|withdrawn|rejected|desk rejected/i.test(decisionLabel);
    if (!title || !openReviewId || !publishedAt || isAnonymous || isUndecided) return [];
    return [{
      id: `openreview:${openReviewId}`,
      title,
      authors,
      abstract,
      publishedAt,
      openReviewId,
      categories: [],
      topicIds: classifyDiscoveryTopics(`${title} ${abstract}`),
      sources: ["openreview"],
      sourceUrl: `https://openreview.net/forum?id=${openReviewId}`,
      pdfUrl,
      venue,
      artifacts: extractArtifacts(abstract, pdfUrl),
    }];
  });
};

const mergeCandidate = (left: Candidate, right: Candidate): Candidate => ({
  ...left,
  title: right.title.length > left.title.length ? right.title : left.title,
  authors: right.authors.length > left.authors.length ? right.authors : left.authors,
  abstract: right.abstract.length > left.abstract.length ? right.abstract : left.abstract,
  publishedAt: left.publishedAt < right.publishedAt ? left.publishedAt : right.publishedAt,
  updatedAt: right.updatedAt ?? left.updatedAt,
  arxivId: right.arxivId ?? left.arxivId,
  doi: right.doi ?? left.doi,
  semanticScholarId: right.semanticScholarId ?? left.semanticScholarId,
  openReviewId: right.openReviewId ?? left.openReviewId,
  categories: unique([...left.categories, ...right.categories]),
  topicIds: unique([...left.topicIds, ...right.topicIds]) as DiscoveryTopicId[],
  sources: unique([...left.sources, ...right.sources]) as DiscoverySource[],
  sourceUrl: left.arxivId ? left.sourceUrl : right.sourceUrl,
  pdfUrl: right.pdfUrl ?? left.pdfUrl,
  venue: right.venue ?? left.venue,
  citationCount: right.citationCount ?? left.citationCount,
  influentialCitationCount: right.influentialCitationCount ?? left.influentialCitationCount,
  recommendationRank: left.recommendationRank && right.recommendationRank
    ? Math.min(left.recommendationRank, right.recommendationRank)
    : (right.recommendationRank ?? left.recommendationRank),
  artifacts: [...left.artifacts, ...right.artifacts].filter((artifact, index, items) => items.findIndex((item) => item.url === artifact.url) === index),
  librarySlug: right.librarySlug ?? left.librarySlug,
});

export const mergeDiscoveryCandidates = (candidates: Candidate[]): Candidate[] => {
  const merged: Candidate[] = [];
  const indices = new Map<string, number>();
  const identityKeys = (paper: Candidate) => [
    paper.arxivId ? `arxiv:${normalizeArxivId(paper.arxivId)}` : "",
    paper.doi ? `doi:${paper.doi.toLowerCase()}` : "",
    paper.semanticScholarId ? `s2:${paper.semanticScholarId}` : "",
    `title:${normalizeDiscoveryTitle(paper.title)}`,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const keys = identityKeys(candidate);
    const existingIndex = keys.map((key) => indices.get(key)).find((index) => index !== undefined);
    if (existingIndex === undefined) {
      const index = merged.push(candidate) - 1;
      for (const key of keys) indices.set(key, index);
      continue;
    }
    merged[existingIndex] = mergeCandidate(merged[existingIndex], candidate);
    for (const key of identityKeys(merged[existingIndex])) indices.set(key, existingIndex);
  }
  return merged;
};

const libraryArxivId = (paper: PaperRecord) => {
  const match = `${paper.sourceUrl} ${paper.pdfUrl ?? ""}`.match(/arxiv\.org\/(?:abs|pdf)\/([^\s?#]+)/i);
  return match ? normalizeArxivId(match[1]) : undefined;
};

export const attachLibraryMatches = (candidates: Candidate[], library: LibrarySnapshot) => {
  const byArxiv = new Map(library.papers.map((paper) => [libraryArxivId(paper), paper]).filter((entry): entry is [string, PaperRecord] => Boolean(entry[0])));
  const byTitle = new Map(library.papers.map((paper) => [normalizeDiscoveryTitle(paper.title), paper]));
  return candidates.map((candidate) => {
    const match = (candidate.arxivId ? byArxiv.get(normalizeArxivId(candidate.arxivId)) : undefined)
      ?? byTitle.get(normalizeDiscoveryTitle(candidate.title));
    return match ? { ...candidate, librarySlug: match.slug } : candidate;
  });
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const fetchWithRetry = async (
  url: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response;
      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw new Error(`${response.status} ${response.statusText}: ${(await response.text()).slice(0, 240)}`);
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(1_000 * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
};

const historicalTopicQuery = "(cat:cs.RO OR cat:cs.AI OR cat:cs.CV OR cat:cs.LG) AND (all:\"vision language action\" OR all:\"robot manipulation\" OR all:\"world model\" OR all:\"imitation learning\" OR all:\"robot navigation\")";
const arxivDate = (date: Date) => date.toISOString().replace(/\D/g, "").slice(0, 12);
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

export const buildArxivQueries = (now = new Date()): Array<{ query: string; limit: number; sortBy?: "submittedDate" | "relevance" }> => [
  { query: "cat:cs.RO", limit: 500 },
  { query: "(cat:cs.AI OR cat:cs.LG) AND (all:robot OR all:embodied OR all:manipulation)", limit: 300 },
  { query: "(cat:cs.CV OR cat:cs.LG) AND (all:\"vision language action\" OR all:\"world model\" OR all:\"imitation learning\")", limit: 300 },
  { query: `${historicalTopicQuery} AND submittedDate:[${arxivDate(daysBefore(now, 365))} TO ${arxivDate(daysBefore(now, 181))}]`, limit: 450, sortBy: "relevance" },
  { query: `${historicalTopicQuery} AND submittedDate:[${arxivDate(daysBefore(now, 730))} TO ${arxivDate(daysBefore(now, 366))}]`, limit: 450, sortBy: "relevance" },
];

export const fetchArxivCandidates = async (now = new Date()) => {
  const candidates: Candidate[] = [];
  for (const [index, item] of buildArxivQueries(now).entries()) {
    if (index > 0) await sleep(3_100);
    const parameters = new URLSearchParams({
      search_query: item.query,
      start: "0",
      max_results: String(item.limit),
      sortBy: item.sortBy ?? "submittedDate",
      sortOrder: "descending",
    });
    const response = await fetchWithRetry(`https://export.arxiv.org/api/query?${parameters}`);
    candidates.push(...parseArxivAtom(await response.text()));
  }
  return mergeDiscoveryCandidates(candidates);
};

const semanticScholarFields = [
  "paperId", "externalIds", "url", "title", "abstract", "venue", "publicationDate", "year",
  "citationCount", "influentialCitationCount", "openAccessPdf", "authors",
].join(",");

const semanticHeaders = (apiKey?: string) => ({
  "content-type": "application/json",
  ...(apiKey ? { "x-api-key": apiKey } : {}),
});

const chunks = <T>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

export const fetchSemanticScholarBatch = async (ids: string[], apiKey?: string) => {
  const results: SemanticScholarPaper[] = [];
  for (const [index, batch] of chunks(unique(ids), 100).entries()) {
    if (index > 0) await sleep(1_100);
    const response = await fetchWithRetry(`https://api.semanticscholar.org/graph/v1/paper/batch?fields=${semanticScholarFields}`, {
      method: "POST",
      headers: semanticHeaders(apiKey),
      body: JSON.stringify({ ids: batch }),
    });
    const payload = await response.json() as Array<SemanticScholarPaper | null>;
    results.push(...payload.filter((paper): paper is SemanticScholarPaper => Boolean(paper)));
  }
  return results;
};

export const selectSeedArxivIds = (library: LibrarySnapshot, maximum = 24) => {
  const read = library.papers.filter((paper) => paper.status === "read" && libraryArxivId(paper));
  const topicOrder = [
    "embodied-foundation-models", "imitation-reinforcement-learning", "multimodal-world-models",
    "navigation-planning", "robot-manipulation", "simulation-datasets-evaluation", "vision-language-action-models",
  ];
  const selected: PaperRecord[] = [];
  for (const topicId of topicOrder) {
    selected.push(...read.filter((paper) => paper.topicIds.includes(topicId) && !selected.includes(paper)).slice(0, 3));
  }
  selected.push(...read.filter((paper) => !selected.includes(paper)));
  return selected.slice(0, maximum).map((paper) => `ARXIV:${libraryArxivId(paper)}`);
};

export const fetchSemanticScholarRecommendations = async (seedPaperIds: string[], apiKey?: string) => {
  if (seedPaperIds.length === 0) return [];
  const response = await fetchWithRetry(`https://api.semanticscholar.org/recommendations/v1/papers?limit=500&fields=${semanticScholarFields}`, {
    method: "POST",
    headers: semanticHeaders(apiKey),
    body: JSON.stringify({ positivePaperIds: seedPaperIds.slice(0, 24), negativePaperIds: [] }),
  });
  const payload = await response.json() as { recommendedPapers?: SemanticScholarPaper[] };
  return (payload.recommendedPapers ?? [])
    .map((paper, index) => candidateFromSemanticScholar(paper, index + 1))
    .filter((paper): paper is Candidate => Boolean(paper));
};

const openReviewVenues = [
  { label: "ICLR 2026", venueId: "ICLR 2026 poster" },
  { label: "NeurIPS 2025", venueId: "NeurIPS 2025 poster" },
  { label: "CoRL 2025", venueId: "CoRL 2025 Poster" },
];

export const fetchOpenReviewCandidates = async () => {
  const candidates: Candidate[] = [];
  for (const venue of openReviewVenues) {
    const parameters = new URLSearchParams({ "content.venueid": venue.venueId, limit: "1000" });
    try {
      const response = await fetchWithRetry(`https://api2.openreview.net/notes?${parameters}`, {}, 1);
      candidates.push(...parseOpenReviewNotes(await response.json(), venue.label));
    } catch (apiV2Error) {
      const legacyParameters = new URLSearchParams({ "content.venue": venue.venueId, limit: "1000" });
      try {
        const legacyResponse = await fetchWithRetry(`https://api.openreview.net/notes?${legacyParameters}`, {}, 1);
        const legacyCandidates = parseOpenReviewNotes(await legacyResponse.json(), venue.label);
        if (legacyCandidates.length === 0) throw apiV2Error;
        candidates.push(...legacyCandidates);
      } catch (apiV1Error) {
        const primary = apiV2Error instanceof Error ? apiV2Error.message : "API v2 unavailable";
        const legacy = apiV1Error instanceof Error ? apiV1Error.message : "API v1 unavailable";
        throw new Error(`OpenReview API v2 failed (${primary}); v1 fallback failed (${legacy})`);
      }
    }
  }
  return mergeDiscoveryCandidates(candidates);
};

const status = (state: DiscoverySourceStatus["state"], fetchedAt: string, recordCount: number, message?: string): DiscoverySourceStatus => ({
  state, fetchedAt, recordCount, ...(message ? { message } : {}),
});

const stableSourceError = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : "";
  const statusCode = message.match(/\b([45]\d\d)\b/)?.[1];
  return statusCode ? `${fallback} (${statusCode})` : fallback;
};

const priorCandidatesForSource = (prior: DiscoverySnapshot | undefined, source: DiscoverySource) =>
  prior?.papers.filter((paper) => paper.sources.includes(source)).map(({ score: _score, ...paper }) => paper) ?? [];

export interface BuildDiscoveryOptions {
  now?: Date;
  apiKey?: string;
  fetchArxiv?: () => Promise<Candidate[]>;
  fetchSemanticBatch?: (ids: string[], apiKey?: string) => Promise<SemanticScholarPaper[]>;
  fetchRecommendations?: (seedIds: string[], apiKey?: string) => Promise<Candidate[]>;
  fetchOpenReview?: () => Promise<Candidate[]>;
}

export const meetsDiscoveryRetention = (
  paper: Pick<DiscoveryPaper, "publishedAt" | "score">,
  now = new Date(),
) => {
  const ageDays = Math.max(0, (now.getTime() - new Date(paper.publishedAt).getTime()) / 86_400_000);
  if (ageDays > RETAINED_DAYS) return false;
  if (ageDays <= STRICT_AGE_DAYS) return true;
  return paper.score.interest >= STRICT_MIN_INTEREST
    && paper.score.evidence >= STRICT_MIN_EVIDENCE
    && paper.score.completeness >= STRICT_MIN_COMPLETENESS;
};

export const buildDiscoverySnapshot = async (
  library: LibrarySnapshot,
  prior?: DiscoverySnapshot,
  options: BuildDiscoveryOptions = {},
): Promise<DiscoverySnapshot> => {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const sources = {} as DiscoverySnapshot["sources"];
  const arxivFetcher = options.fetchArxiv ?? fetchArxivCandidates;
  const semanticBatchFetcher = options.fetchSemanticBatch ?? fetchSemanticScholarBatch;
  const recommendationsFetcher = options.fetchRecommendations ?? fetchSemanticScholarRecommendations;
  const openReviewFetcher = options.fetchOpenReview ?? fetchOpenReviewCandidates;

  const arxiv = await arxivFetcher();
  if (arxiv.length === 0) throw new Error("arXiv returned no candidates; keeping the previous discovery snapshot");
  sources.arxiv = status("ok", generatedAt, arxiv.length);

  const seedArxivIds = selectSeedArxivIds(library);
  let semantic: Candidate[] = [];
  try {
    const arxivIds = arxiv.flatMap((paper) => paper.arxivId ? [`ARXIV:${paper.arxivId}`] : []);
    const [metadata, seedMetadata] = await Promise.all([
      semanticBatchFetcher(arxivIds, options.apiKey),
      semanticBatchFetcher(seedArxivIds, options.apiKey),
    ]);
    const recommendationSeeds = seedMetadata.map((paper) => paper.paperId).filter((id): id is string => Boolean(id));
    semantic = [
      ...metadata.map((paper) => candidateFromSemanticScholar(paper)).filter((paper): paper is Candidate => Boolean(paper)),
      ...await recommendationsFetcher(recommendationSeeds, options.apiKey),
    ];
    sources["semantic-scholar"] = status("ok", generatedAt, semantic.length);
  } catch (error) {
    semantic = priorCandidatesForSource(prior, "semantic-scholar");
    sources["semantic-scholar"] = status("degraded", generatedAt, semantic.length, stableSourceError(error, "Semantic Scholar unavailable"));
  }

  let openReview: Candidate[] = [];
  try {
    openReview = await openReviewFetcher();
    sources.openreview = status("ok", generatedAt, openReview.length);
  } catch (error) {
    openReview = priorCandidatesForSource(prior, "openreview");
    sources.openreview = status("degraded", generatedAt, openReview.length, stableSourceError(error, "OpenReview unavailable"));
  }

  const cutoff = now.getTime() - RETAINED_DAYS * 86_400_000;
  const candidates = attachLibraryMatches(
    mergeDiscoveryCandidates([...arxiv, ...semantic, ...openReview])
      .filter((paper) => new Date(paper.publishedAt).getTime() >= cutoff),
    library,
  );
  const scored = candidates
    .map((paper) => ({ ...paper, score: scoreDiscoveryPaper(paper, now) }))
    .filter((paper) => meetsDiscoveryRetention(paper, now))
    .sort((a, b) => b.score.total - a.score.total || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, CANDIDATE_CAP);

  if (prior && prior.meta.candidateCount > 0 && scored.length < prior.meta.candidateCount * 0.5) {
    throw new Error(`Discovery refresh shrank from ${prior.meta.candidateCount} to ${scored.length}; keeping previous snapshot`);
  }

  validateDiscoverySnapshotPapers(scored);
  return {
    schemaVersion: 1,
    generatedAt,
    retainedDays: RETAINED_DAYS,
    candidateCap: CANDIDATE_CAP,
    papers: scored,
    sources,
    meta: {
      candidateCount: scored.length,
      featuredCount: scored.filter((paper) => !paper.librarySlug && paper.score.tier === "priority").length,
      libraryMatchCount: scored.filter((paper) => paper.librarySlug).length,
      seedCount: seedArxivIds.length,
    },
  };
};

export const validateDiscoverySnapshotPapers = (papers: DiscoveryPaper[]) => {
  const ids = new Set<string>();
  const arxivIds = new Set<string>();
  const titles = new Set<string>();
  for (const paper of papers) {
    if (!paper.id || !paper.title || !paper.publishedAt || !paper.sourceUrl) throw new Error(`Incomplete discovery paper: ${paper.id || paper.title}`);
    if (ids.has(paper.id)) throw new Error(`Duplicate discovery id: ${paper.id}`);
    ids.add(paper.id);
    if (paper.arxivId) {
      const normalized = normalizeArxivId(paper.arxivId);
      if (arxivIds.has(normalized)) throw new Error(`Duplicate arXiv id: ${normalized}`);
      arxivIds.add(normalized);
    }
    const normalizedTitle = normalizeDiscoveryTitle(paper.title);
    if (titles.has(normalizedTitle)) throw new Error(`Duplicate discovery title: ${paper.title}`);
    titles.add(normalizedTitle);
    if (paper.score.total < 0 || paper.score.total > 100) throw new Error(`Invalid discovery score: ${paper.id}`);
  }
};

export const discoverySnapshotMeaningfullyChanged = (left: DiscoverySnapshot | undefined, right: DiscoverySnapshot) => {
  if (!left) return true;
  const canonical = (snapshot: DiscoverySnapshot) => ({
    ...snapshot,
    generatedAt: undefined,
    sources: Object.fromEntries(Object.entries(snapshot.sources).map(([key, value]) => [key, { ...value, fetchedAt: undefined }])),
  });
  return JSON.stringify(canonical(left)) !== JSON.stringify(canonical(right));
};
