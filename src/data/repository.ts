import { papers, terms } from "./demo";
import { fields } from "./fields";
import type { FieldId } from "./types";

export const getFields = () => fields;

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

export const validateDemoRelationships = (): string[] => {
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

  return errors;
};
