import snapshotJson from "./generated/library.json";
import { fields } from "./fields";
import type { FieldId, LibrarySnapshot, PaperRecord } from "./types";

const snapshot = snapshotJson as LibrarySnapshot;
const { papers, terms, topics } = snapshot;

export const getFields = () => fields;
export const getLibraryMeta = () => snapshot.meta;

export const getFieldBySlug = (slug: string) =>
  fields.find((field) => field.slug === slug);

export const getPaperBySlug = (slug: string) =>
  papers.find((paper) => paper.slug === slug);

export const getPaperById = (id: string) =>
  papers.find((paper) => paper.id === id);

export const getPapersByField = (fieldId: FieldId) =>
  papers.filter((paper) => paper.fieldIds.includes(fieldId));

export const getTermsByField = (fieldId: FieldId) =>
  terms.filter((term) => term.fieldId === fieldId);

export const getTermsByIds = (ids: string[]) =>
  ids.map((id) => terms.find((term) => term.id === id)).filter((term) => term !== undefined);

export const getTopicsByField = (fieldId: FieldId) =>
  fieldId === "embodied-intelligence" ? topics : [];

export const getTopicById = (id: string) => topics.find((topic) => topic.id === id);

export const getRecentPapers = (limit = 6) => papers
  .filter((paper) => paper.recentRank !== undefined)
  .sort((a, b) => (a.recentRank ?? 99) - (b.recentRank ?? 99))
  .slice(0, limit);

export const getRelatedPapers = (paper: PaperRecord, limit = 6) => papers
  .filter((candidate) => candidate.id !== paper.id)
  .map((candidate) => ({
    paper: candidate,
    overlap: candidate.topicIds.filter((topicId) => paper.topicIds.includes(topicId)).length,
  }))
  .filter((candidate) => candidate.overlap > 0)
  .sort((a, b) => b.overlap - a.overlap || b.paper.sourceNumber - a.paper.sourceNumber)
  .slice(0, limit)
  .map((candidate) => candidate.paper);

export const validateLibraryRelationships = (): string[] => {
  const errors: string[] = [];
  const paperIds = new Set(papers.map((paper) => paper.id));
  const termIds = new Set(terms.map((term) => term.id));
  const fieldIds = new Set(fields.map((field) => field.id));

  for (const paper of papers) {
    for (const fieldId of paper.fieldIds) {
      if (!fieldIds.has(fieldId)) errors.push(`${paper.id}: missing field ${fieldId}`);
    }
    for (const termId of paper.termIds) {
      if (!termIds.has(termId)) errors.push(`${paper.id}: missing term ${termId}`);
    }
  }

  for (const term of terms) {
    if (!fieldIds.has(term.fieldId)) errors.push(`${term.id}: missing field ${term.fieldId}`);
    for (const paperId of term.relatedPaperIds) {
      if (!paperIds.has(paperId)) errors.push(`${term.id}: missing paper ${paperId}`);
    }
  }

  for (const topic of topics) {
    for (const paperId of topic.paperIds) {
      if (!paperIds.has(paperId)) errors.push(`${topic.id}: missing paper ${paperId}`);
    }
  }

  return errors;
};
