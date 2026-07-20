import type {
  DiscoveryArtifact,
  DiscoveryPaper,
  DiscoverySnapshot,
  DiscoverySource,
  DiscoverySourceStatus,
  DiscoveryTopicId,
} from "../../src/data/discovery-types";
import type { FieldId, LibrarySnapshot, PaperRecord } from "../../src/data/types";
import {
  classifyDiscoveryFields,
  classifyDiscoveryTopics,
  classifyDiscoveryPublication,
  DISCOVERY_SCORE_VERSION,
  discoveryTopicsForField,
  normalizeDiscoveryTitle,
  scoreDiscoveryPaper,
  semanticRecommendationBoost,
} from "../../src/lib/discovery";

export const RETAINED_DAYS = 730;
export const STRICT_AGE_DAYS = 180;
export const STRICT_MIN_RELEVANCE = 24;
export const STRICT_MIN_EVIDENCE = 14;
export const STRICT_MIN_COMPLETENESS = 12;
export const CANDIDATE_CAP = 2_000;
export const DISCOVERY_FIELD_IDS: FieldId[] = ["embodied-intelligence", "cs-ai", "cs-cl", "cs-cv", "cs-lg"];

export type Candidate = Omit<DiscoveryPaper, "score" | "canonicalVenueId" | "publicationStatus" | "personalization"> &
  Partial<Pick<DiscoveryPaper, "canonicalVenueId" | "publicationStatus" | "personalization">>;

export type LegacyDiscoveryPaper = Candidate & { score?: unknown; recommendationRank?: number };
export type LegacyDiscoverySnapshot = Omit<DiscoverySnapshot, "schemaVersion" | "fieldId" | "papers" | "meta"> & {
  schemaVersion: number;
  fieldId?: FieldId;
  papers: LegacyDiscoveryPaper[];
  meta: Omit<DiscoverySnapshot["meta"], "scoreVersion"> & { scoreVersion?: string };
};

export const upgradeDiscoverySnapshot = (snapshot: LegacyDiscoverySnapshot, fieldId: FieldId): DiscoverySnapshot => {
  const papers = snapshot.papers.map((paper) => {
    const { score: _score, recommendationRank: _legacyRank, ...candidate } = paper;
    const fieldIds = candidate.fieldIds?.length ? candidate.fieldIds : classifyDiscoveryFields(candidate.categories, candidate.topicIds);
    const semanticRank = candidate.recommendationRanks?.[fieldId];
    const scopedCandidate = {
      ...candidate,
      fieldIds,
      recommendationRanks: semanticRank ? { [fieldId]: semanticRank } : undefined,
    };
    const publication = classifyDiscoveryPublication(scopedCandidate, fieldId);
    const upgraded = {
      ...scopedCandidate,
      canonicalVenueId: publication.canonicalVenueId,
      publicationStatus: publication.publicationStatus,
      personalization: semanticRank
        ? { semanticRank, semanticBoost: semanticRecommendationBoost(semanticRank) }
        : {},
    };
    return { ...upgraded, score: scoreDiscoveryPaper(upgraded, new Date(snapshot.generatedAt), fieldId) };
  });
  return {
    ...snapshot,
    schemaVersion: 3,
    fieldId,
    papers,
    meta: {
      ...snapshot.meta,
      featuredCount: papers.filter((paper) => !paper.librarySlug && paper.score.tier === "priority").length,
      scoreVersion: DISCOVERY_SCORE_VERSION,
    },
  };
};

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
    const fieldIds = classifyDiscoveryFields(categories, topicIds);
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
      fieldIds,
      topicIds,
      sources: ["arxiv"],
      sourceUrl,
      pdfUrl,
      artifacts: extractArtifacts(`${comment} ${abstract}`, pdfUrl),
    };
  }).filter((paper) => paper.arxivId && paper.title && paper.publishedAt);
};

const candidateFromSemanticScholar = (paper: SemanticScholarPaper, recommendationRank?: number, recommendationFieldId?: FieldId): Candidate | undefined => {
  const title = paper.title?.trim() ?? "";
  const publishedAt = paper.publicationDate ?? (paper.year ? `${paper.year}-01-01` : "");
  if (!paper.paperId || !title || !publishedAt) return undefined;
  const arxivId = normalizeArxivId(paper.externalIds?.ArXiv);
  const pdfUrl = paper.openAccessPdf?.url || (arxivId ? `https://arxiv.org/pdf/${arxivId}` : undefined);
  const sourceUrl = arxivId ? `https://arxiv.org/abs/${arxivId}` : (paper.url ?? `https://www.semanticscholar.org/paper/${paper.paperId}`);
  const semanticVenue = paper.venue?.trim();
  const topicIds = classifyDiscoveryTopics(`${title} ${paper.abstract ?? ""}`);
  const fieldIds = classifyDiscoveryFields([], topicIds);
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
    fieldIds,
    topicIds,
    sources: ["semantic-scholar"],
    sourceUrl,
    pdfUrl,
    venue: semanticVenue && !/^arxiv(?:\.org)?$/i.test(semanticVenue) ? semanticVenue : undefined,
    citationCount: paper.citationCount,
    influentialCitationCount: paper.influentialCitationCount,
    recommendationRanks: recommendationRank && recommendationFieldId ? { [recommendationFieldId]: recommendationRank } : undefined,
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
    const topicIds = classifyDiscoveryTopics(`${title} ${abstract}`);
    return [{
      id: `openreview:${openReviewId}`,
      title,
      authors,
      abstract,
      publishedAt,
      openReviewId,
      categories: [],
      fieldIds: classifyDiscoveryFields([], topicIds),
      topicIds,
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
  fieldIds: unique([...left.fieldIds, ...right.fieldIds]) as FieldId[],
  topicIds: unique([...left.topicIds, ...right.topicIds]) as DiscoveryTopicId[],
  sources: unique([...left.sources, ...right.sources]) as DiscoverySource[],
  sourceUrl: left.arxivId ? left.sourceUrl : right.sourceUrl,
  pdfUrl: right.pdfUrl ?? left.pdfUrl,
  venue: right.venue ?? left.venue,
  citationCount: right.citationCount ?? left.citationCount,
  influentialCitationCount: right.influentialCitationCount ?? left.influentialCitationCount,
  recommendationRanks: Object.fromEntries(DISCOVERY_FIELD_IDS.flatMap((fieldId) => {
    const ranks = [left.recommendationRanks?.[fieldId], right.recommendationRanks?.[fieldId]].filter((rank): rank is number => rank !== undefined);
    return ranks.length > 0 ? [[fieldId, Math.min(...ranks)]] : [];
  })),
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

const arxivDate = (date: Date) => date.toISOString().replace(/\D/g, "").slice(0, 12);
const daysBefore = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000);

const fieldArxivScopes: Record<FieldId, { categories: string; topics: string }> = {
  "embodied-intelligence": {
    categories: "(cat:cs.RO OR cat:cs.AI OR cat:cs.CV OR cat:cs.LG)",
    topics: "(all:robot OR all:embodied OR all:manipulation OR all:navigation OR all:\"vision language action\" OR all:\"world model\")",
  },
  "cs-ai": {
    categories: "cat:cs.AI",
    topics: "(all:reasoning OR all:planning OR all:agent OR all:\"knowledge graph\" OR all:alignment OR all:multi-agent)",
  },
  "cs-cl": {
    categories: "cat:cs.CL",
    topics: "(all:\"language model\" OR all:retrieval OR all:\"question answering\" OR all:\"information extraction\" OR all:multilingual OR all:translation OR all:hallucination)",
  },
  "cs-cv": {
    categories: "cat:cs.CV",
    topics: "(all:recognition OR all:detection OR all:segmentation OR all:generation OR all:\"3d reconstruction\" OR all:video OR all:\"vision language\")",
  },
  "cs-lg": {
    categories: "(cat:cs.LG OR cat:stat.ML)",
    topics: "(all:optimization OR all:\"representation learning\" OR all:\"self-supervised\" OR all:\"reinforcement learning\" OR all:\"generative model\" OR all:robustness OR all:generalization)",
  },
};

export const buildArxivQueries = (
  fieldId: FieldId = "embodied-intelligence",
  now = new Date(),
): Array<{ query: string; limit: number; sortBy?: "submittedDate" | "relevance" }> => {
  const scope = fieldArxivScopes[fieldId];
  const base = `${scope.categories} AND ${scope.topics}`;
  return [
    { query: `${base} AND submittedDate:[${arxivDate(daysBefore(now, 180))} TO ${arxivDate(now)}]`, limit: 700 },
    { query: `${base} AND submittedDate:[${arxivDate(daysBefore(now, 365))} TO ${arxivDate(daysBefore(now, 181))}]`, limit: 650, sortBy: "relevance" },
    { query: `${base} AND submittedDate:[${arxivDate(daysBefore(now, 730))} TO ${arxivDate(daysBefore(now, 366))}]`, limit: 650, sortBy: "relevance" },
  ];
};

export const fetchArxivCandidates = async (fieldId: FieldId = "embodied-intelligence", now = new Date()) => {
  const candidates: Candidate[] = [];
  for (const [index, item] of buildArxivQueries(fieldId, now).entries()) {
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
  return mergeDiscoveryCandidates(candidates).filter((paper) =>
    paper.fieldIds.includes(fieldId)
    && paper.topicIds.some((topicId) => discoveryTopicsForField(fieldId).some((topic) => topic.id === topicId)));
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

export const selectSeedArxivIds = (library: LibrarySnapshot, fieldId: FieldId = "embodied-intelligence", maximum = 24) => {
  const read = library.papers.filter((paper) => paper.status === "read" && paper.fieldIds.includes(fieldId) && libraryArxivId(paper));
  const topicOrder = discoveryTopicsForField(fieldId).map((topic) => topic.id);
  const selected: PaperRecord[] = [];
  for (const topicId of topicOrder) {
    selected.push(...read.filter((paper) => paper.topicIds.includes(topicId) && !selected.includes(paper)).slice(0, 3));
  }
  selected.push(...read.filter((paper) => !selected.includes(paper)));
  return selected.slice(0, maximum).map((paper) => `ARXIV:${libraryArxivId(paper)}`);
};

export const fetchSemanticScholarRecommendations = async (seedPaperIds: string[], fieldId: FieldId, apiKey?: string) => {
  if (seedPaperIds.length === 0) return [];
  const response = await fetchWithRetry(`https://api.semanticscholar.org/recommendations/v1/papers?limit=500&fields=${semanticScholarFields}`, {
    method: "POST",
    headers: semanticHeaders(apiKey),
    body: JSON.stringify({ positivePaperIds: seedPaperIds.slice(0, 24), negativePaperIds: [] }),
  });
  const payload = await response.json() as { recommendedPapers?: SemanticScholarPaper[] };
  return (payload.recommendedPapers ?? [])
    .map((paper, index) => candidateFromSemanticScholar(paper, index + 1, fieldId))
    .filter((paper): paper is Candidate => Boolean(paper))
    .filter((paper) => paper.fieldIds.includes(fieldId));
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
  fieldId?: FieldId;
  fetchArxiv?: (fieldId: FieldId) => Promise<Candidate[]>;
  fetchSemanticBatch?: (ids: string[], apiKey?: string) => Promise<SemanticScholarPaper[]>;
  fetchRecommendations?: (seedIds: string[], fieldId: FieldId, apiKey?: string) => Promise<Candidate[]>;
  fetchOpenReview?: () => Promise<Candidate[]>;
}

const candidateBelongsToField = (paper: Pick<Candidate, "fieldIds" | "topicIds">, fieldId: FieldId) => {
  const allowedTopics = new Set(discoveryTopicsForField(fieldId).map((topic) => topic.id));
  return paper.fieldIds.includes(fieldId) && paper.topicIds.some((topicId) => allowedTopics.has(topicId));
};

const buildSnapshotFromCandidates = (
  library: LibrarySnapshot,
  fieldId: FieldId,
  candidates: Candidate[],
  sources: DiscoverySnapshot["sources"],
  seedCount: number,
  now: Date,
  prior?: DiscoverySnapshot,
) => {
  const cutoff = now.getTime() - RETAINED_DAYS * 86_400_000;
  const scored = attachLibraryMatches(
    mergeDiscoveryCandidates(candidates)
      .filter((paper) => new Date(paper.publishedAt).getTime() >= cutoff)
      .filter((paper) => candidateBelongsToField(paper, fieldId)),
    library,
  )
    .map((paper): DiscoveryPaper => {
      const publication = classifyDiscoveryPublication(paper, fieldId);
      const semanticRank = paper.recommendationRanks?.[fieldId];
      const enriched = {
        ...paper,
        canonicalVenueId: publication.canonicalVenueId,
        publicationStatus: publication.publicationStatus,
        recommendationRanks: semanticRank ? { [fieldId]: semanticRank } : undefined,
        personalization: semanticRank
          ? { semanticRank, semanticBoost: semanticRecommendationBoost(semanticRank) }
          : {},
      };
      return { ...enriched, score: scoreDiscoveryPaper(enriched, now, fieldId) };
    })
    .filter((paper) => meetsDiscoveryRetention(paper, now))
    .sort((a, b) => b.score.baseTotal - a.score.baseTotal || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, CANDIDATE_CAP);

  if (scored.length === 0) throw new Error(`${fieldId} produced no eligible candidates`);
  if (prior && prior.meta.candidateCount > 0 && scored.length < prior.meta.candidateCount * 0.5) {
    throw new Error(`${fieldId} refresh shrank from ${prior.meta.candidateCount} to ${scored.length}`);
  }

  validateDiscoverySnapshotPapers(scored, fieldId);
  return {
    schemaVersion: 3,
    fieldId,
    generatedAt: now.toISOString(),
    retainedDays: RETAINED_DAYS,
    candidateCap: CANDIDATE_CAP,
    papers: scored,
    sources,
    meta: {
      candidateCount: scored.length,
      featuredCount: scored.filter((paper) => !paper.librarySlug && paper.score.tier === "priority").length,
      libraryMatchCount: scored.filter((paper) => paper.librarySlug).length,
      seedCount,
      scoreVersion: DISCOVERY_SCORE_VERSION,
    },
  } satisfies DiscoverySnapshot;
};

export const meetsDiscoveryRetention = (
  paper: Pick<DiscoveryPaper, "publishedAt" | "score">,
  now = new Date(),
) => {
  const ageDays = Math.max(0, (now.getTime() - new Date(paper.publishedAt).getTime()) / 86_400_000);
  if (ageDays > RETAINED_DAYS) return false;
  if (ageDays <= STRICT_AGE_DAYS) return true;
  return paper.score.relevance >= STRICT_MIN_RELEVANCE
    && paper.score.evidence >= STRICT_MIN_EVIDENCE
    && paper.score.completeness >= STRICT_MIN_COMPLETENESS;
};

export const buildDiscoverySnapshot = async (
  library: LibrarySnapshot,
  prior?: DiscoverySnapshot,
  options: BuildDiscoveryOptions = {},
): Promise<DiscoverySnapshot> => {
  const now = options.now ?? new Date();
  const fieldId = options.fieldId ?? "embodied-intelligence";
  const generatedAt = now.toISOString();
  const sources = {} as DiscoverySnapshot["sources"];
  const arxivFetcher = options.fetchArxiv ?? fetchArxivCandidates;
  const semanticBatchFetcher = options.fetchSemanticBatch ?? fetchSemanticScholarBatch;
  const recommendationsFetcher = options.fetchRecommendations ?? fetchSemanticScholarRecommendations;
  const openReviewFetcher = options.fetchOpenReview ?? fetchOpenReviewCandidates;

  const arxiv = await arxivFetcher(fieldId);
  if (arxiv.length === 0) throw new Error("arXiv returned no candidates; keeping the previous discovery snapshot");
  sources.arxiv = status("ok", generatedAt, arxiv.length);

  const seedArxivIds = selectSeedArxivIds(library, fieldId);
  let semantic: Candidate[] = [];
  try {
    const arxivIds = arxiv.flatMap((paper) => paper.arxivId ? [`ARXIV:${paper.arxivId}`] : []);
    const metadata = await semanticBatchFetcher([...arxivIds, ...seedArxivIds], options.apiKey);
    const seedSet = new Set(seedArxivIds.map((id) => normalizeArxivId(id.replace(/^ARXIV:/i, ""))));
    const recommendationSeeds = metadata
      .filter((paper) => seedSet.has(normalizeArxivId(paper.externalIds?.ArXiv)))
      .map((paper) => paper.paperId)
      .filter((id): id is string => Boolean(id));
    semantic = [
      ...metadata.map((paper) => candidateFromSemanticScholar(paper)).filter((paper): paper is Candidate => Boolean(paper)),
      ...(recommendationSeeds.length >= 5 ? await recommendationsFetcher(recommendationSeeds, fieldId, options.apiKey) : []),
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

  return buildSnapshotFromCandidates(library, fieldId, [...arxiv, ...semantic, ...openReview], sources, seedArxivIds.length, now, prior);
};

export type DiscoverySnapshotMap = Partial<Record<FieldId, DiscoverySnapshot>>;

export const buildDiscoverySnapshots = async (
  library: LibrarySnapshot,
  priors: DiscoverySnapshotMap = {},
  options: BuildDiscoveryOptions = {},
): Promise<DiscoverySnapshotMap> => {
  const now = options.now ?? new Date();
  const generatedAt = now.toISOString();
  const arxivFetcher = options.fetchArxiv ?? ((fieldId: FieldId) => fetchArxivCandidates(fieldId, now));
  const semanticBatchFetcher = options.fetchSemanticBatch ?? fetchSemanticScholarBatch;
  const recommendationsFetcher = options.fetchRecommendations ?? fetchSemanticScholarRecommendations;
  const openReviewFetcher = options.fetchOpenReview ?? fetchOpenReviewCandidates;
  const arxivByField = new Map<FieldId, Candidate[]>();
  const arxivErrors = new Map<FieldId, unknown>();

  for (const fieldId of DISCOVERY_FIELD_IDS) {
    try {
      const papers = await arxivFetcher(fieldId);
      if (papers.length === 0) throw new Error("arXiv returned no candidates");
      arxivByField.set(fieldId, papers);
    } catch (error) {
      arxivErrors.set(fieldId, error);
    }
  }

  const seedIdsByField = new Map(DISCOVERY_FIELD_IDS.map((fieldId) => [fieldId, selectSeedArxivIds(library, fieldId)]));
  const arxivCandidates = mergeDiscoveryCandidates([...arxivByField.values()].flat());
  let semanticCandidates: Candidate[] = [];
  let semanticState: DiscoverySourceStatus["state"] = "ok";
  let semanticMessage: string | undefined;
  try {
    const arxivIds = arxivCandidates.flatMap((paper) => paper.arxivId ? [`ARXIV:${paper.arxivId}`] : []);
    const allSeedIds = [...seedIdsByField.values()].flat();
    const metadata = await semanticBatchFetcher([...arxivIds, ...allSeedIds], options.apiKey);
    semanticCandidates = metadata.map((paper) => candidateFromSemanticScholar(paper)).filter((paper): paper is Candidate => Boolean(paper));
    const metadataByArxiv = new Map(metadata.flatMap((paper) => paper.externalIds?.ArXiv && paper.paperId
      ? [[normalizeArxivId(paper.externalIds.ArXiv), paper.paperId] as const]
      : []));
    for (const fieldId of DISCOVERY_FIELD_IDS) {
      const seedPaperIds = (seedIdsByField.get(fieldId) ?? [])
        .map((id) => metadataByArxiv.get(normalizeArxivId(id.replace(/^ARXIV:/i, ""))))
        .filter((id): id is string => Boolean(id));
      if (seedPaperIds.length >= 5) semanticCandidates.push(...await recommendationsFetcher(seedPaperIds, fieldId, options.apiKey));
    }
  } catch (error) {
    semanticState = "degraded";
    semanticMessage = stableSourceError(error, "Semantic Scholar unavailable");
  }

  let openReviewCandidates: Candidate[] = [];
  let openReviewState: DiscoverySourceStatus["state"] = "ok";
  let openReviewMessage: string | undefined;
  try {
    openReviewCandidates = await openReviewFetcher();
  } catch (error) {
    openReviewState = "degraded";
    openReviewMessage = stableSourceError(error, "OpenReview unavailable");
  }

  const snapshots: DiscoverySnapshotMap = {};
  let successfulFields = 0;
  for (const fieldId of DISCOVERY_FIELD_IDS) {
    const prior = priors[fieldId];
    if (arxivErrors.has(fieldId)) {
      if (!prior) throw new Error(`${fieldId} arXiv failed without a previous snapshot`);
      const error = arxivErrors.get(fieldId);
      console.warn(`${fieldId} arXiv failed; keeping migrated prior snapshot: ${error instanceof Error ? error.message : String(error)}`);
      snapshots[fieldId] = prior;
      continue;
    }
    const arxiv = arxivByField.get(fieldId) ?? [];
    const semantic = semanticState === "ok" ? semanticCandidates : priorCandidatesForSource(prior, "semantic-scholar");
    const openReview = openReviewState === "ok" ? openReviewCandidates : priorCandidatesForSource(prior, "openreview");
    const sources = {
      arxiv: status("ok", generatedAt, arxiv.length),
      "semantic-scholar": status(semanticState, generatedAt, semantic.filter((paper) => candidateBelongsToField(paper, fieldId)).length, semanticMessage),
      openreview: status(openReviewState, generatedAt, openReview.filter((paper) => candidateBelongsToField(paper, fieldId)).length, openReviewMessage),
    } satisfies DiscoverySnapshot["sources"];
    try {
      snapshots[fieldId] = buildSnapshotFromCandidates(
        library,
        fieldId,
        [...arxiv, ...semantic, ...openReview],
        sources,
        seedIdsByField.get(fieldId)?.length ?? 0,
        now,
        prior,
      );
      successfulFields += 1;
    } catch (error) {
      if (!prior) throw error;
      console.warn(`${fieldId} refresh kept prior snapshot: ${error instanceof Error ? error.message : String(error)}`);
      snapshots[fieldId] = prior;
    }
  }
  if (successfulFields === 0) throw new Error("All discovery fields failed; keeping every previous snapshot");
  return snapshots;
};

export const validateDiscoverySnapshotPapers = (papers: DiscoveryPaper[], fieldId?: FieldId) => {
  const ids = new Set<string>();
  const arxivIds = new Set<string>();
  const titles = new Set<string>();
  for (const paper of papers) {
    if (!paper.id || !paper.title || !paper.publishedAt || !paper.sourceUrl) throw new Error(`Incomplete discovery paper: ${paper.id || paper.title}`);
    if (paper.fieldIds.length === 0 || (fieldId && !candidateBelongsToField(paper, fieldId))) throw new Error(`Discovery paper is outside ${fieldId ?? "all fields"}: ${paper.id}`);
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
    if (paper.score.baseTotal < 0 || paper.score.baseTotal > 100) throw new Error(`Invalid discovery score: ${paper.id}`);
    if (fieldId && Object.keys(paper.recommendationRanks ?? {}).some((rankField) => rankField !== fieldId)) {
      throw new Error(`Cross-field recommendation rank leaked into ${fieldId}: ${paper.id}`);
    }
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
