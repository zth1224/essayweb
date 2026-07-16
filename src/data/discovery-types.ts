export type DiscoverySource = "arxiv" | "semantic-scholar" | "openreview";
export type DiscoverySourceState = "ok" | "degraded" | "error";
export type DiscoveryTier = "priority" | "skim" | "track" | "archive";
export type DiscoveryDecision = "queued" | "dismissed" | "seen";

export type DiscoveryTopicId =
  | "embodied-foundation-models"
  | "imitation-reinforcement-learning"
  | "multimodal-world-models"
  | "navigation-planning"
  | "robot-manipulation"
  | "simulation-datasets-evaluation"
  | "vision-language-action-models";

export interface DiscoveryScore {
  interest: number;
  evidence: number;
  freshness: number;
  completeness: number;
  total: number;
  tier: DiscoveryTier;
  reasons: string[];
}

export interface DiscoveryArtifact {
  kind: "code" | "project" | "pdf";
  url: string;
}

export interface DiscoveryPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  publishedAt: string;
  updatedAt?: string;
  arxivId?: string;
  doi?: string;
  semanticScholarId?: string;
  openReviewId?: string;
  categories: string[];
  topicIds: DiscoveryTopicId[];
  sources: DiscoverySource[];
  sourceUrl: string;
  pdfUrl?: string;
  venue?: string;
  citationCount?: number;
  influentialCitationCount?: number;
  recommendationRank?: number;
  artifacts: DiscoveryArtifact[];
  librarySlug?: string;
  score: DiscoveryScore;
}

export interface DiscoverySourceStatus {
  state: DiscoverySourceState;
  fetchedAt: string;
  recordCount: number;
  message?: string;
}

export interface DiscoverySnapshot {
  schemaVersion: 1;
  generatedAt: string;
  retainedDays: number;
  candidateCap: number;
  papers: DiscoveryPaper[];
  sources: Record<DiscoverySource, DiscoverySourceStatus>;
  meta: {
    candidateCount: number;
    featuredCount: number;
    libraryMatchCount: number;
    seedCount: number;
  };
}

export interface StoredDiscoveryDecision {
  decision: DiscoveryDecision;
  updatedAt: string;
}
