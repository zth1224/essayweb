import type { FieldId } from "./types";

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
  interest: number;
  evidence: number;
  freshness: number;
  completeness: number;
  total: number;
  tier: DiscoveryTier;
  reasons: string[];
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
  citationCount?: number;
  influentialCitationCount?: number;
  recommendationRank?: number;
  recommendationRanks?: Partial<Record<FieldId, number>>;
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
  schemaVersion: 2;
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
  sources: Record<DiscoverySource, DiscoverySourceStatus>;
}

export interface DiscoveryIndex {
  schemaVersion: 1;
  generatedAt: string;
  fields: DiscoveryIndexEntry[];
}

export interface StoredDiscoveryDecision {
  decision: DiscoveryDecision;
  updatedAt: string;
}
