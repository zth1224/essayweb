import type { FieldId } from "./types";

export type DiscoverySource = "arxiv" | "semantic-scholar" | "openreview";
export type DiscoverySourceState = "ok" | "degraded" | "error";
export type DiscoveryTier = "priority" | "skim" | "track" | "archive";
export type DiscoveryDecision = "queued" | "dismissed" | "seen";
export type DiscoveryPublicationStatus = "core" | "formal" | "unverified" | "preprint";

export type DiscoveryTopicId =
  | "embodied-foundation-models"
  | "imitation-reinforcement-learning"
  | "multimodal-world-models"
  | "navigation-planning"
  | "robot-manipulation"
  | "simulation-datasets-evaluation"
  | "vision-language-action-models"
  | "ai-reasoning-planning"
  | "ai-agents-tool-use"
  | "ai-knowledge-retrieval"
  | "ai-multi-agent-systems"
  | "ai-safety-alignment"
  | "cl-language-modeling"
  | "cl-retrieval-question-answering"
  | "cl-information-extraction"
  | "cl-multilingual-translation"
  | "cl-evaluation-safety"
  | "cv-representation-recognition"
  | "cv-image-video-generation"
  | "cv-three-dimensional-vision"
  | "cv-video-understanding"
  | "cv-vision-language-multimodal"
  | "lg-theory-optimization"
  | "lg-representation-self-supervised"
  | "lg-reinforcement-learning"
  | "lg-generative-modeling"
  | "lg-robustness-generalization";

export interface DiscoveryTopicDefinition {
  id: DiscoveryTopicId;
  fieldId: FieldId;
  label: string;
  keywords: string[];
}

export interface DiscoveryScore {
  baseTotal: number;
  relevance: number;
  evidence: number;
  freshness: number;
  completeness: number;
  tier: DiscoveryTier;
  reasons: string[];
  evidenceBreakdown: {
    publication: number;
    citations: number;
    reproducibility: number;
    empirical: number;
    corroboration: number;
  };
}

export interface DiscoveryPersonalization {
  semanticRank?: number;
  semanticBoost?: number;
}

export interface DiscoveryArtifact {
  kind: "code" | "project" | "dataset" | "model" | "pdf";
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
  fieldIds: FieldId[];
  topicIds: DiscoveryTopicId[];
  sources: DiscoverySource[];
  sourceUrl: string;
  pdfUrl?: string;
  venue?: string;
  canonicalVenueId?: string;
  publicationStatus: DiscoveryPublicationStatus;
  citationCount?: number;
  influentialCitationCount?: number;
  recommendationRanks?: Partial<Record<FieldId, number>>;
  personalization: DiscoveryPersonalization;
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
  schemaVersion: 3;
  fieldId: FieldId;
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
    scoreVersion: "reading-priority-v3";
  };
}

export interface DiscoveryIndexEntry {
  fieldId: FieldId;
  generatedAt: string;
  retainedDays: number;
  candidateCount: number;
  featuredCount: number;
  libraryMatchCount: number;
  seedCount: number;
  scoreVersion: "reading-priority-v3";
  sources: Record<DiscoverySource, DiscoverySourceStatus>;
}

export interface DiscoveryIndex {
  schemaVersion: 2;
  generatedAt: string;
  fields: DiscoveryIndexEntry[];
}

export interface StoredDiscoveryDecision {
  decision: DiscoveryDecision;
  updatedAt: string;
}
