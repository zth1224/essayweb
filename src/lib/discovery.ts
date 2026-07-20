import type {
  DiscoveryDecision,
  DiscoveryPaper,
  DiscoveryPublicationStatus,
  DiscoveryScore,
  DiscoveryTier,
  DiscoveryTopicId,
  StoredDiscoveryDecision,
  DiscoveryTopicDefinition,
} from "../data/discovery-types";
import type { FieldId } from "../data/types";

export const DISCOVERY_DECISION_KEY = "paper-index:discovery-decisions:v1";
export const DISCOVERY_PAGE_SIZE = 24;
export const DISCOVERY_RECENT_DAYS = 180;
export const DISCOVERY_MAX_AGE_DAYS = 730;
export const DISCOVERY_SCORE_VERSION = "reading-priority-v3" as const;

export const discoveryTopics: DiscoveryTopicDefinition[] = [
  {
    id: "embodied-foundation-models",
    fieldId: "embodied-intelligence",
    label: "具身基础模型",
    keywords: ["embodied foundation", "generalist robot", "robot foundation", "general-purpose robot"],
  },
  {
    id: "imitation-reinforcement-learning",
    fieldId: "embodied-intelligence",
    label: "模仿与强化学习",
    keywords: ["imitation learning", "reinforcement learning", "behavior cloning", "policy learning", "offline rl"],
  },
  {
    id: "multimodal-world-models",
    fieldId: "embodied-intelligence",
    label: "多模态与世界模型",
    keywords: ["world model", "multimodal", "video prediction", "future prediction", "latent dynamics"],
  },
  {
    id: "navigation-planning",
    fieldId: "embodied-intelligence",
    label: "导航与规划",
    keywords: ["navigation", "motion planning", "task planning", "autonomous driving", "trajectory planning"],
  },
  {
    id: "robot-manipulation",
    fieldId: "embodied-intelligence",
    label: "机器人操作",
    keywords: ["manipulation", "grasp", "dexterous", "bimanual", "contact-rich", "robotic arm"],
  },
  {
    id: "simulation-datasets-evaluation",
    fieldId: "embodied-intelligence",
    label: "仿真、数据集与评测",
    keywords: ["benchmark", "dataset", "simulation", "sim-to-real", "evaluation", "teleoperation"],
  },
  {
    id: "vision-language-action-models",
    fieldId: "embodied-intelligence",
    label: "视觉语言动作模型",
    keywords: ["vision-language-action", "vision language action", "vla", "language-conditioned robot"],
  },
  { id: "ai-reasoning-planning", fieldId: "cs-ai", label: "推理与规划", keywords: ["reasoning", "planning", "search algorithm", "constraint satisfaction", "theorem proving"] },
  { id: "ai-agents-tool-use", fieldId: "cs-ai", label: "智能体与工具", keywords: ["ai agent", "autonomous agent", "tool use", "tool-use", "computer use", "web agent"] },
  { id: "ai-knowledge-retrieval", fieldId: "cs-ai", label: "知识表示与检索", keywords: ["knowledge representation", "knowledge graph", "ontology", "semantic search", "neural retrieval"] },
  { id: "ai-multi-agent-systems", fieldId: "cs-ai", label: "多智能体", keywords: ["multi-agent", "multiagent", "agent collaboration", "agent cooperation", "agent communication"] },
  { id: "ai-safety-alignment", fieldId: "cs-ai", label: "安全与对齐", keywords: ["ai safety", "alignment", "harmlessness", "jailbreak", "red teaming", "reward hacking"] },
  { id: "cl-language-modeling", fieldId: "cs-cl", label: "语言模型与预训练", keywords: ["language model", "large language model", "pretraining", "pre-training", "tokenizer", "scaling law"] },
  { id: "cl-retrieval-question-answering", fieldId: "cs-cl", label: "检索增强与问答", keywords: ["retrieval augmented", "retrieval-augmented", "question answering", "open-domain qa", "document retrieval"] },
  { id: "cl-information-extraction", fieldId: "cs-cl", label: "信息抽取", keywords: ["information extraction", "named entity", "relation extraction", "semantic parsing", "structured prediction"] },
  { id: "cl-multilingual-translation", fieldId: "cs-cl", label: "多语言与机器翻译", keywords: ["multilingual", "machine translation", "cross-lingual", "low-resource language", "speech translation"] },
  { id: "cl-evaluation-safety", fieldId: "cs-cl", label: "NLP 评测与安全", keywords: ["language model evaluation", "nlp benchmark", "factuality", "hallucination", "toxicity", "prompt injection"] },
  { id: "cv-representation-recognition", fieldId: "cs-cv", label: "视觉表征与识别", keywords: ["image recognition", "object detection", "semantic segmentation", "visual representation", "image classification"] },
  { id: "cv-image-video-generation", fieldId: "cs-cv", label: "图像与视频生成", keywords: ["image generation", "video generation", "diffusion model", "text-to-image", "text-to-video", "generative vision"] },
  { id: "cv-three-dimensional-vision", fieldId: "cs-cv", label: "三维视觉", keywords: ["3d vision", "three-dimensional", "3d reconstruction", "neural rendering", "novel view synthesis", "point cloud"] },
  { id: "cv-video-understanding", fieldId: "cs-cv", label: "视频理解", keywords: ["video understanding", "action recognition", "video segmentation", "temporal localization", "video reasoning"] },
  { id: "cv-vision-language-multimodal", fieldId: "cs-cv", label: "视觉语言与多模态", keywords: ["vision-language", "vision language", "visual question answering", "multimodal model", "image-text"] },
  { id: "lg-theory-optimization", fieldId: "cs-lg", label: "学习理论与优化", keywords: ["learning theory", "optimization", "convergence", "generalization bound", "online learning"] },
  { id: "lg-representation-self-supervised", fieldId: "cs-lg", label: "表征与自监督", keywords: ["representation learning", "self-supervised", "self supervised", "contrastive learning", "masked modeling"] },
  { id: "lg-reinforcement-learning", fieldId: "cs-lg", label: "强化学习", keywords: ["reinforcement learning", "offline rl", "policy optimization", "reward model", "markov decision"] },
  { id: "lg-generative-modeling", fieldId: "cs-lg", label: "生成建模", keywords: ["generative model", "diffusion model", "flow matching", "variational autoencoder", "normalizing flow"] },
  { id: "lg-robustness-generalization", fieldId: "cs-lg", label: "鲁棒性与泛化", keywords: ["robustness", "out-of-distribution", "domain generalization", "distribution shift", "adversarial example", "uncertainty"] },
];

export const discoveryTopicLabel = (id: DiscoveryTopicId) =>
  discoveryTopics.find((topic) => topic.id === id)?.label ?? id;

export const normalizeDiscoveryText = (value: string) => value
  .normalize("NFKC")
  .trim()
  .replace(/\s+/g, " ")
  .toLowerCase();

export const normalizeDiscoveryTitle = (value: string) => normalizeDiscoveryText(value)
  .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
  .trim();

export const discoveryTopicsForField = (fieldId: FieldId) => discoveryTopics.filter((topic) => topic.fieldId === fieldId);

export const classifyDiscoveryTopics = (text: string, fieldId?: FieldId): DiscoveryTopicId[] => {
  const normalized = normalizeDiscoveryText(text);
  return discoveryTopics
    .filter((topic) => !fieldId || topic.fieldId === fieldId)
    .filter((topic) => topic.keywords.some((keyword) => normalized.includes(keyword)))
    .map((topic) => topic.id);
};

export const classifyDiscoveryFields = (categories: string[], topicIds: DiscoveryTopicId[]): FieldId[] => {
  const fields = new Set<FieldId>();
  if (categories.includes("cs.AI")) fields.add("cs-ai");
  if (categories.includes("cs.CL")) fields.add("cs-cl");
  if (categories.includes("cs.CV")) fields.add("cs-cv");
  if (categories.includes("cs.LG") || categories.includes("stat.ML")) fields.add("cs-lg");
  if (categories.includes("cs.RO")) fields.add("embodied-intelligence");
  for (const topicId of topicIds) {
    const fieldId = discoveryTopics.find((topic) => topic.id === topicId)?.fieldId;
    if (fieldId) fields.add(fieldId);
  }
  return [...fields];
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

interface DiscoveryVenueDefinition {
  id: string;
  fieldIds: FieldId[];
  pattern: RegExp;
}

const venueDefinitions: DiscoveryVenueDefinition[] = [
  { id: "corl", fieldIds: ["embodied-intelligence"], pattern: /\bcorl\b|conference on robot learning/i },
  { id: "rss", fieldIds: ["embodied-intelligence"], pattern: /\brss\b|robotics science and systems/i },
  { id: "icra", fieldIds: ["embodied-intelligence"], pattern: /\bicra\b|international conference on robotics and automation/i },
  { id: "iros", fieldIds: ["embodied-intelligence"], pattern: /\biros\b|international conference on intelligent robots? and systems/i },
  { id: "aaai", fieldIds: ["cs-ai"], pattern: /\baaai\b|conference on artificial intelligence/i },
  { id: "ijcai", fieldIds: ["cs-ai"], pattern: /\bijcai\b|international joint conference on artificial intelligence/i },
  { id: "aamas", fieldIds: ["cs-ai"], pattern: /\baamas\b|autonomous agents and multiagent systems/i },
  { id: "uai", fieldIds: ["cs-ai", "cs-lg"], pattern: /\buai\b|uncertainty in artificial intelligence/i },
  { id: "findings-acl", fieldIds: ["cs-cl"], pattern: /findings of (?:the )?(?:association for computational linguistics|acl)/i },
  { id: "emnlp", fieldIds: ["cs-cl"], pattern: /\bemnlp\b|empirical methods in natural language processing/i },
  { id: "naacl", fieldIds: ["cs-cl"], pattern: /\bnaacl\b|north american chapter of (?:the )?association for computational linguistics/i },
  { id: "eacl", fieldIds: ["cs-cl"], pattern: /\beacl\b|european chapter of (?:the )?association for computational linguistics/i },
  { id: "coling", fieldIds: ["cs-cl"], pattern: /\bcoling\b|international conference on computational linguistics/i },
  { id: "acl", fieldIds: ["cs-cl"], pattern: /\bacl\b|annual meeting of (?:the )?association for computational linguistics/i },
  { id: "cvpr", fieldIds: ["cs-cv"], pattern: /\bcvpr\b|computer vision and pattern recognition/i },
  { id: "iccv", fieldIds: ["cs-cv"], pattern: /\biccv\b|international conference on computer vision/i },
  { id: "eccv", fieldIds: ["cs-cv"], pattern: /\beccv\b|european conference on computer vision/i },
  { id: "wacv", fieldIds: ["cs-cv"], pattern: /\bwacv\b|winter conference on applications of computer vision/i },
  { id: "neurips", fieldIds: ["cs-lg"], pattern: /\b(?:neurips|nips)\b|neural information processing systems/i },
  { id: "icml", fieldIds: ["cs-lg"], pattern: /\bicml\b|international conference on machine learning(?! and applications)/i },
  { id: "iclr", fieldIds: ["cs-lg"], pattern: /\biclr\b|international conference on learning representations/i },
  { id: "aistats", fieldIds: ["cs-lg"], pattern: /\baistats\b|artificial intelligence and statistics/i },
  { id: "colt", fieldIds: ["cs-lg"], pattern: /\bcolt\b|conference on learning theory/i },
];

const normalizeVenue = (venue: string) => venue
  .normalize("NFKC")
  .toLowerCase()
  .replace(/\b(?:19|20)\d{2}\b/g, " ")
  .replace(/(?:ieee|acm)(?:\s*\/\s*(?:cvf|rsj|rjs))?/g, " ")
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

export const canonicalizeDiscoveryVenue = (venue = "") => {
  const normalized = normalizeVenue(venue);
  const definition = venueDefinitions.find((item) => item.pattern.test(normalized));
  return definition ? { id: definition.id, fieldIds: definition.fieldIds } : undefined;
};

const isWorkshopVenue = (venue = "") => /\b(?:workshop|workshops|cvprw)\b/i.test(venue);

export const classifyDiscoveryPublication = (
  paper: Pick<DiscoveryPaper, "venue" | "doi" | "openReviewId">,
  fieldId: FieldId,
): { canonicalVenueId?: string; publicationStatus: DiscoveryPublicationStatus; publicationPoints: number } => {
  const canonical = canonicalizeDiscoveryVenue(paper.venue);
  const workshop = isWorkshopVenue(paper.venue);
  let publicationStatus: DiscoveryPublicationStatus = "preprint";
  let publicationPoints = 0;
  if (canonical?.fieldIds.includes(fieldId) && !workshop) {
    publicationStatus = "core";
    publicationPoints = 10;
  } else if (canonical || paper.doi) {
    publicationStatus = "formal";
    publicationPoints = 6;
  } else if (paper.venue) {
    publicationStatus = "unverified";
    publicationPoints = 2;
  }
  if (paper.openReviewId) publicationPoints = Math.min(12, publicationPoints + 2);
  return { canonicalVenueId: canonical?.id, publicationStatus, publicationPoints };
};

export const isFormalDiscoveryVenue = (venue = "", fieldId?: FieldId) => {
  const canonical = canonicalizeDiscoveryVenue(venue);
  if (!canonical || isWorkshopVenue(venue)) return false;
  return fieldId ? canonical.fieldIds.includes(fieldId) : true;
};

export const discoveryPublicationLabel = (status: DiscoveryPublicationStatus) => ({
  core: "本方向核心",
  formal: "正式发表",
  unverified: "未验证 venue",
  preprint: "预印本",
})[status];

export const semanticRecommendationBoost = (rank?: number) => rank
  ? clamp(16 - Math.ceil(rank / 50), 6, 15)
  : 0;

const evidenceArtifactKind = (artifact: DiscoveryPaper["artifacts"][number]) => {
  if (/huggingface\.co\/datasets\/|kaggle\.com\/datasets\/|zenodo\.org\/records?\//i.test(artifact.url)) return "dataset";
  if (/huggingface\.co\/(?!datasets\/)[^/]+\/[^/]+/i.test(artifact.url)) return "model";
  return artifact.kind;
};

type DiscoveryScoringPaper = Omit<DiscoveryPaper, "score" | "canonicalVenueId" | "publicationStatus" | "personalization"> &
  Partial<Pick<DiscoveryPaper, "canonicalVenueId" | "publicationStatus" | "personalization">>;

export const tierForDiscoveryScore = (
  score: Pick<DiscoveryScore, "baseTotal" | "relevance" | "evidence" | "completeness">,
  ageDays: number,
): DiscoveryTier => {
  const priorityEvidence = ageDays <= DISCOVERY_RECENT_DAYS ? 16 : 20;
  if (score.baseTotal >= 70 && score.relevance >= 24 && score.completeness >= 12 && score.evidence >= priorityEvidence) return "priority";
  if (score.baseTotal >= 60 && score.evidence >= 10) return "skim";
  if (score.baseTotal >= 45) return "track";
  return "archive";
};

export const scoreDiscoveryPaper = (
  paper: DiscoveryScoringPaper,
  now = new Date(),
  fieldId = paper.fieldIds[0] ?? "embodied-intelligence",
): DiscoveryScore => {
  const published = new Date(paper.publishedAt);
  const ageDays = Math.max(0, (now.getTime() - published.getTime()) / 86_400_000);
  const reasons: string[] = [];

  const fieldTopicCount = paper.topicIds.filter((topicId) => discoveryTopics.find((topic) => topic.id === topicId)?.fieldId === fieldId).length;
  const fieldPoints = paper.fieldIds.includes(fieldId) ? 10 : 0;
  const topicPoints = fieldTopicCount ? clamp(14 + (fieldTopicCount - 1) * 3, 14, 20) : 0;
  const relevance = clamp(fieldPoints + topicPoints, 0, 30);
  if (fieldPoints) reasons.push("匹配当前研究方向");
  if (fieldTopicCount >= 2) reasons.push(`覆盖当前方向 ${fieldTopicCount} 个关注主题`);

  const publication = classifyDiscoveryPublication(paper, fieldId);
  const publicationPoints = publication.publicationPoints;
  if (publication.publicationStatus === "core") reasons.push(`本方向核心 venue：${paper.venue}`);
  else if (publication.publicationStatus === "formal") reasons.push(`已有正式发表线索：${paper.venue ?? paper.doi}`);

  let citationPoints = 0;
  if (ageDays >= 30 && paper.citationCount !== undefined) {
    const citationsPerMonth = paper.citationCount / Math.max(1, ageDays / 30);
    citationPoints = clamp(Math.round(Math.log2(citationsPerMonth + 1) * 1.5), 0, 8);
    if (citationPoints >= 4) reasons.push("同龄论文中引用增长较快");
  } else if (ageDays < 30) {
    reasons.push("新论文不因零引用降权");
  }

  const artifactKinds = new Set(paper.artifacts.map(evidenceArtifactKind));
  const reproducibilityPoints = Math.min(10,
    (artifactKinds.has("code") ? 4 : 0)
    + (artifactKinds.has("project") ? 2 : 0)
    + (artifactKinds.has("dataset") ? 2 : 0)
    + (artifactKinds.has("model") ? 2 : 0));
  if (artifactKinds.has("code")) reasons.push("提供可复现代码");
  if (artifactKinds.has("dataset") || artifactKinds.has("model")) reasons.push("提供数据集或模型资源");
  else if (artifactKinds.has("project")) reasons.push("提供项目页面");

  let empiricalPoints = 0;
  if (/\b(benchmark|experiment(?:s|al)?|evaluation|evaluate[ds]?|test suite)\b/i.test(paper.abstract)) empiricalPoints += 2;
  if (/(?:\b\d+(?:\.\d+)?\s*(?:%|x\b|fps\b|hz\b))|(?:success rate|accuracy|precision|recall|reward)\s*(?:of|by|to|=)?\s*\d/i.test(paper.abstract)) empiricalPoints += 2;
  if (/\b(outperform(?:s|ed)?|baseline(?:s)?|state-of-the-art|sota|compared? (?:to|with)|versus|improv(?:e|es|ed|ement))\b/i.test(paper.abstract)) empiricalPoints += 2;
  if (/\bablation(?:s| study| studies)?\b/i.test(paper.abstract)) empiricalPoints += 2;
  if (/\b(?:multiple|several|across) (?:datasets|benchmarks|tasks|robots|domains|environments)\b/i.test(paper.abstract)) empiricalPoints += 2;
  if (/\b(?:confidence interval|standard deviation|statistical(?:ly)? significant|variance)\b/i.test(paper.abstract)) empiricalPoints += 1;
  empiricalPoints = clamp(empiricalPoints, 0, 11);
  if (empiricalPoints >= 6) reasons.push("包含明确的量化、对比或消融实验");
  else if (empiricalPoints >= 2) reasons.push("摘要给出实验或 benchmark 线索");

  const corroborationPoints = Math.min(4,
    (paper.sources.length >= 2 ? 2 : 0)
    + (paper.doi || paper.openReviewId ? 2 : 0));
  const evidence = clamp(publicationPoints + citationPoints + reproducibilityPoints + empiricalPoints + corroborationPoints, 0, 45);

  const freshness = ageDays <= 30
    ? 5
    : clamp(Math.round(5 * (DISCOVERY_MAX_AGE_DAYS - ageDays) / (DISCOVERY_MAX_AGE_DAYS - 30)), 0, 5);
  if (ageDays <= 14) reasons.push("两周内发布");

  let completeness = 0;
  if (paper.abstract.length >= 240) completeness += 5;
  if (paper.authors.length > 0) completeness += 2;
  if (paper.sourceUrl && paper.publishedAt) completeness += 2;
  if (paper.pdfUrl) completeness += 2;
  if (paper.venue) completeness += 2;
  if (paper.citationCount !== undefined) completeness += 2;
  if (paper.arxivId || paper.doi || paper.semanticScholarId || paper.openReviewId) completeness += 2;
  if (/\b(benchmark|experiment|evaluation|success rate|outperform|improv(?:e|es|ed|ement)|\d+(?:\.\d+)?%)\b/i.test(paper.abstract)) completeness += 3;
  completeness = clamp(completeness, 0, 20);
  if (completeness >= 14) reasons.push("摘要、来源与实验线索较完整");

  const baseTotal = clamp(relevance + evidence + freshness + completeness, 0, 100);
  const scoreBase = { baseTotal, relevance, evidence, freshness, completeness };
  return {
    ...scoreBase,
    tier: tierForDiscoveryScore(scoreBase, ageDays),
    reasons: [...new Set(reasons)].slice(0, 8),
    evidenceBreakdown: {
      publication: publicationPoints,
      citations: citationPoints,
      reproducibility: reproducibilityPoints,
      empirical: empiricalPoints,
      corroboration: corroborationPoints,
    },
  };
};

export interface DiscoveryFilters {
  query?: string;
  topicId?: DiscoveryTopicId | "all";
  age?: "7" | "30" | "90" | "180" | "365" | "730" | "all";
  dateFrom?: string;
  dateTo?: string;
  venue?: "all" | "core" | "formal" | "unverified" | "preprint";
  source?: "all" | "arxiv" | "semantic-scholar" | "openreview";
  tier?: DiscoveryTier | "all";
  library?: "all" | "new" | "collected";
}

export const balanceDiscoveryAgeBands = <T extends Pick<DiscoveryPaper, "publishedAt">>(
  papers: T[],
  now = new Date(),
  recentPerCycle = 1,
  olderPerCycle = 2,
) => {
  const cutoff = now.getTime() - DISCOVERY_RECENT_DAYS * 86_400_000;
  const recent = papers.filter((paper) => new Date(paper.publishedAt).getTime() >= cutoff);
  const older = papers.filter((paper) => new Date(paper.publishedAt).getTime() < cutoff);
  const balanced: T[] = [];
  let recentIndex = 0;
  let olderIndex = 0;
  while (recentIndex < recent.length || olderIndex < older.length) {
    for (let index = 0; index < recentPerCycle && recentIndex < recent.length; index += 1) balanced.push(recent[recentIndex++]);
    for (let index = 0; index < olderPerCycle && olderIndex < older.length; index += 1) balanced.push(older[olderIndex++]);
    if (olderIndex >= older.length && recentIndex < recent.length) balanced.push(...recent.slice(recentIndex));
    if (recentIndex >= recent.length && olderIndex < older.length) balanced.push(...older.slice(olderIndex));
    if (olderIndex >= older.length || recentIndex >= recent.length) break;
  }
  return balanced;
};

export const selectDiscoveryFeatured = <T extends Pick<DiscoveryPaper, "publishedAt">>(
  papers: T[],
  now = new Date(),
) => {
  const cutoff = now.getTime() - DISCOVERY_RECENT_DAYS * 86_400_000;
  const recent = papers.filter((paper) => new Date(paper.publishedAt).getTime() >= cutoff).slice(0, 1);
  const older = papers.filter((paper) => new Date(paper.publishedAt).getTime() < cutoff).slice(0, 2);
  return [...recent, ...older];
};

export const discoveryTextRelevance = (paper: DiscoveryPaper, query: string) => {
  const normalizedQuery = normalizeDiscoveryText(query);
  if (!normalizedQuery) return 0;
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const title = normalizeDiscoveryText(paper.title);
  const authors = normalizeDiscoveryText(paper.authors.join(" "));
  const haystack = normalizeDiscoveryText([
    paper.title,
    paper.authors.join(" "),
    paper.abstract,
    paper.venue ?? "",
    paper.topicIds.map(discoveryTopicLabel).join(" "),
  ].join(" "));
  if (!tokens.every((token) => haystack.includes(token))) return -1;
  let score = tokens.reduce((total, token) => total + (title.includes(token) ? 8 : 0) + (authors.includes(token) ? 3 : 0) + 1, 0);
  if (title.includes(normalizedQuery)) score += 16;
  return score;
};

const discoveryTierWeight: Record<DiscoveryTier, number> = {
  priority: 3,
  skim: 2,
  track: 1,
  archive: 0,
};

export const compareDiscoveryReadingPriority = (left: DiscoveryPaper, right: DiscoveryPaper) =>
  discoveryTierWeight[right.score.tier] - discoveryTierWeight[left.score.tier]
  || (right.score.baseTotal + (right.personalization.semanticBoost ?? 0)) - (left.score.baseTotal + (left.personalization.semanticBoost ?? 0))
  || right.score.baseTotal - left.score.baseTotal
  || right.publishedAt.localeCompare(left.publishedAt);

export const filterAndSortDiscoveryPapers = (
  papers: DiscoveryPaper[],
  filters: DiscoveryFilters,
  now = new Date(),
) => {
  const query = filters.query ?? "";
  const ageLimit = filters.age && filters.age !== "all" ? Number(filters.age) : undefined;
  const sorted = papers
    .map((paper) => ({ paper, relevance: discoveryTextRelevance(paper, query) }))
    .filter(({ paper, relevance }) => {
      if (query && relevance < 0) return false;
      if (filters.topicId && filters.topicId !== "all" && !paper.topicIds.includes(filters.topicId)) return false;
      if (ageLimit) {
        const ageDays = (now.getTime() - new Date(paper.publishedAt).getTime()) / 86_400_000;
        if (ageDays > ageLimit) return false;
      }
      const publishedDate = paper.publishedAt.slice(0, 10);
      if (filters.dateFrom && publishedDate < filters.dateFrom) return false;
      if (filters.dateTo && publishedDate > filters.dateTo) return false;
      if (filters.venue === "core" && paper.publicationStatus !== "core") return false;
      if (filters.venue === "formal" && paper.publicationStatus !== "core" && paper.publicationStatus !== "formal") return false;
      if (filters.venue === "unverified" && paper.publicationStatus !== "unverified") return false;
      if (filters.venue === "preprint" && paper.publicationStatus !== "preprint") return false;
      if (filters.source && filters.source !== "all" && !paper.sources.includes(filters.source)) return false;
      if (filters.tier && filters.tier !== "all" && paper.score.tier !== filters.tier) return false;
      if (filters.library === "new" && paper.librarySlug) return false;
      if (filters.library === "collected" && !paper.librarySlug) return false;
      return true;
    })
    .sort((a, b) => query
      ? b.relevance - a.relevance || compareDiscoveryReadingPriority(a.paper, b.paper)
      : compareDiscoveryReadingPriority(a.paper, b.paper))
    .map(({ paper }) => paper);
  return query ? sorted : balanceDiscoveryAgeBands(sorted, now);
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const validDecisions = new Set<DiscoveryDecision>(["queued", "dismissed", "seen"]);

export const createDiscoveryDecisionStore = (storage?: StorageLike) => {
  let state: Record<string, StoredDiscoveryDecision> = {};
  try {
    const saved = storage?.getItem(DISCOVERY_DECISION_KEY);
    const parsed = saved ? JSON.parse(saved) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      state = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, StoredDiscoveryDecision] => {
        const value = entry[1] as StoredDiscoveryDecision;
        return Boolean(value && validDecisions.has(value.decision) && typeof value.updatedAt === "string");
      }));
    }
  } catch {
    state = {};
  }

  const persist = () => {
    try { storage?.setItem(DISCOVERY_DECISION_KEY, JSON.stringify(state)); } catch { /* keep memory state */ }
  };

  return {
    all: () => ({ ...state }),
    get: (id: string) => state[id]?.decision,
    set(id: string, decision: DiscoveryDecision) {
      state = { ...state, [id]: { decision, updatedAt: new Date().toISOString() } };
      persist();
    },
    remove(id: string) {
      const next = { ...state };
      delete next[id];
      state = next;
      persist();
    },
  };
};

export const discoveryPersonalizationAdjustment = (
  paper: Pick<DiscoveryPaper, "id" | "topicIds">,
  papersById: Map<string, Pick<DiscoveryPaper, "topicIds">>,
  decisions: Record<string, StoredDiscoveryDecision>,
) => {
  let adjustment = 0;
  for (const [id, stored] of Object.entries(decisions)) {
    if (id === paper.id || (stored.decision !== "queued" && stored.decision !== "dismissed")) continue;
    const decidedPaper = papersById.get(id);
    if (!decidedPaper) continue;
    const overlap = decidedPaper.topicIds.filter((topicId) => paper.topicIds.includes(topicId)).length;
    adjustment += overlap * (stored.decision === "queued" ? 2 : -2);
  }
  return clamp(adjustment, -8, 8);
};
