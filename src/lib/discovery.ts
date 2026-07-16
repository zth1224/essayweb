import type {
  DiscoveryDecision,
  DiscoveryPaper,
  DiscoveryScore,
  DiscoveryTier,
  DiscoveryTopicId,
  StoredDiscoveryDecision,
} from "../data/discovery-types";

export const DISCOVERY_DECISION_KEY = "paper-index:discovery-decisions:v1";
export const DISCOVERY_PAGE_SIZE = 24;
export const DISCOVERY_RECENT_DAYS = 180;
export const DISCOVERY_MAX_AGE_DAYS = 730;

export const discoveryTopics: Array<{
  id: DiscoveryTopicId;
  label: string;
  keywords: string[];
}> = [
  {
    id: "embodied-foundation-models",
    label: "具身基础模型",
    keywords: ["embodied foundation", "generalist robot", "robot foundation", "general-purpose robot"],
  },
  {
    id: "imitation-reinforcement-learning",
    label: "模仿与强化学习",
    keywords: ["imitation learning", "reinforcement learning", "behavior cloning", "policy learning", "offline rl"],
  },
  {
    id: "multimodal-world-models",
    label: "多模态与世界模型",
    keywords: ["world model", "multimodal", "video prediction", "future prediction", "latent dynamics"],
  },
  {
    id: "navigation-planning",
    label: "导航与规划",
    keywords: ["navigation", "motion planning", "task planning", "autonomous driving", "trajectory planning"],
  },
  {
    id: "robot-manipulation",
    label: "机器人操作",
    keywords: ["manipulation", "grasp", "dexterous", "bimanual", "contact-rich", "robotic arm"],
  },
  {
    id: "simulation-datasets-evaluation",
    label: "仿真、数据集与评测",
    keywords: ["benchmark", "dataset", "simulation", "sim-to-real", "evaluation", "teleoperation"],
  },
  {
    id: "vision-language-action-models",
    label: "视觉语言动作模型",
    keywords: ["vision-language-action", "vision language action", "vla", "language-conditioned robot"],
  },
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

export const classifyDiscoveryTopics = (text: string): DiscoveryTopicId[] => {
  const normalized = normalizeDiscoveryText(text);
  return discoveryTopics
    .filter((topic) => topic.keywords.some((keyword) => normalized.includes(keyword)))
    .map((topic) => topic.id);
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const tierForScore = (score: number): DiscoveryTier => {
  if (score >= 75) return "priority";
  if (score >= 60) return "skim";
  if (score >= 45) return "track";
  return "archive";
};

export const isFormalDiscoveryVenue = (venue = "") => /\b(iclr|neurips|icml|corl|rss|robotics science and systems|icra|iros|cvpr|iccv|eccv)\b/i.test(venue);

const evidenceArtifactKind = (artifact: DiscoveryPaper["artifacts"][number]) => {
  if (/huggingface\.co\/datasets\/|kaggle\.com\/datasets\/|zenodo\.org\/records?\//i.test(artifact.url)) return "dataset";
  if (/huggingface\.co\/(?!datasets\/)[^/]+\/[^/]+/i.test(artifact.url)) return "model";
  return artifact.kind;
};

export const scoreDiscoveryPaper = (
  paper: Omit<DiscoveryPaper, "score">,
  now = new Date(),
): DiscoveryScore => {
  const published = new Date(paper.publishedAt);
  const ageDays = Math.max(0, (now.getTime() - published.getTime()) / 86_400_000);
  const reasons: string[] = [];

  const recommendationPoints = paper.recommendationRank
    ? clamp(31 - Math.ceil(paper.recommendationRank / 25), 10, 30)
    : 0;
  const topicPoints = paper.topicIds.length
    ? clamp(7 + paper.topicIds.length * 2, 7, 15)
    : 0;
  const interest = clamp(recommendationPoints + topicPoints, 0, 45);
  if (recommendationPoints >= 24) reasons.push("与已读论文高度相似");
  if (paper.topicIds.length >= 2) reasons.push(`覆盖 ${paper.topicIds.length} 个关注主题`);

  let evidence = 0;
  if (isFormalDiscoveryVenue(paper.venue)) {
    evidence += 6;
    reasons.push(`已关联正式 venue：${paper.venue}`);
  }
  if (ageDays >= 30 && paper.citationCount !== undefined) {
    const citationsPerMonth = paper.citationCount / Math.max(1, ageDays / 30);
    const citationPoints = clamp(Math.round(Math.log2(citationsPerMonth + 1)), 0, 4);
    evidence += citationPoints;
    if (citationPoints >= 3) reasons.push("同龄论文中引用增长较快");
  } else if (ageDays < 30) {
    reasons.push("新论文不以零引用降权");
  }
  const artifactKinds = new Set(paper.artifacts.map(evidenceArtifactKind));
  const artifactPoints = Math.min(8,
    (artifactKinds.has("code") ? 4 : 0)
    + (artifactKinds.has("project") ? 2 : 0)
    + (artifactKinds.has("dataset") ? 2 : 0)
    + (artifactKinds.has("model") ? 2 : 0));
  evidence += artifactPoints;
  if (artifactKinds.has("code")) reasons.push("提供可复现代码");
  if (artifactKinds.has("dataset") || artifactKinds.has("model")) reasons.push("提供数据集或模型资源");
  else if (artifactKinds.has("project")) reasons.push("提供项目页面");

  let empiricalPoints = 0;
  if (/\b(benchmark|experiment(?:s|al)?|evaluation|evaluate[ds]?|test suite)\b/i.test(paper.abstract)) empiricalPoints += 2;
  if (/(?:\b\d+(?:\.\d+)?\s*(?:%|x\b|fps\b|hz\b))|(?:success rate|accuracy|precision|recall|reward)\s*(?:of|by|to|=)?\s*\d/i.test(paper.abstract)) empiricalPoints += 2;
  if (/\b(outperform(?:s|ed)?|baseline(?:s)?|state-of-the-art|sota|compared? (?:to|with)|versus|improv(?:e|es|ed|ement))\b/i.test(paper.abstract)) empiricalPoints += 2;
  if (/\bablation(?:s| study| studies)?\b/i.test(paper.abstract)) empiricalPoints += 1;
  evidence = clamp(evidence + empiricalPoints, 0, 25);
  if (empiricalPoints >= 4) reasons.push("包含明确的量化与对比实验");
  else if (empiricalPoints >= 2) reasons.push("摘要给出实验或 benchmark 线索");

  const freshness = ageDays <= 30
    ? 15
    : clamp(Math.round(15 * (DISCOVERY_MAX_AGE_DAYS - ageDays) / (DISCOVERY_MAX_AGE_DAYS - 30)), 0, 15);
  if (ageDays <= 14) reasons.push("两周内发布");

  let completeness = 0;
  if (paper.abstract.length >= 240) completeness += 6;
  if (paper.authors.length > 0) completeness += 3;
  if (paper.sourceUrl && paper.publishedAt) completeness += 2;
  if (paper.venue) completeness += 2;
  if (/\b(benchmark|experiment|evaluation|success rate|outperform|improv(?:e|es|ed|ement)|\d+(?:\.\d+)?%)\b/i.test(paper.abstract)) completeness += 2;
  completeness = clamp(completeness, 0, 15);
  if (completeness >= 11) reasons.push("摘要与实验线索较完整");

  const total = clamp(interest + evidence + freshness + completeness, 0, 100);
  return {
    interest,
    evidence,
    freshness,
    completeness,
    total,
    tier: tierForScore(total),
    reasons: [...new Set(reasons)].slice(0, 7),
  };
};

export interface DiscoveryFilters {
  query?: string;
  topicId?: DiscoveryTopicId | "all";
  age?: "7" | "30" | "90" | "180" | "365" | "730" | "all";
  dateFrom?: string;
  dateTo?: string;
  venue?: "all" | "formal" | "preprint";
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
      if (filters.venue === "formal" && !isFormalDiscoveryVenue(paper.venue)) return false;
      if (filters.venue === "preprint" && isFormalDiscoveryVenue(paper.venue)) return false;
      if (filters.source && filters.source !== "all" && !paper.sources.includes(filters.source)) return false;
      if (filters.tier && filters.tier !== "all" && paper.score.tier !== filters.tier) return false;
      if (filters.library === "new" && paper.librarySlug) return false;
      if (filters.library === "collected" && !paper.librarySlug) return false;
      return true;
    })
    .sort((a, b) => query
      ? b.relevance - a.relevance || b.paper.score.total - a.paper.score.total
      : b.paper.score.total - a.paper.score.total || b.paper.publishedAt.localeCompare(a.paper.publishedAt))
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
