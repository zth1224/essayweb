import { fields } from "./fields";
import type { PaperRecord, TermRecord } from "./types";

const fieldAliases: Record<string, string> = {
  "cs-ai": "AI",
  "cs-cl": "CL",
  "cs-cv": "CV",
  "cs-lg": "LG",
  "embodied-intelligence": "Embodied",
};

const sharedSections = {
  background: "这里展示研究背景与问题定义的排版结构。真实内容将在下一阶段从论文库接入。",
  method: "这里展示方法、模型结构与关键模块的排版结构。当前文本仅用于验证模板。",
  experiments: "这里展示实验设置、指标、主要结果与消融分析的排版结构。",
  contributions: "这里展示论文贡献和可复用启发的排版结构。",
  limitations: "这里展示局限、风险与待验证问题的排版结构。",
};

export const papers: PaperRecord[] = fields.flatMap((field) => {
  const alias = fieldAliases[field.id];
  const prefix = field.id === "embodied-intelligence" ? "embodied" : field.id.slice(3);
  const tags = field.id === "embodied-intelligence"
    ? ["robotics-template", "demo-data"]
    : [`${alias.toLowerCase()}-template`, "demo-data"];

  return [1, 2].map((index) => ({
    id: `paper-${prefix}-0${index}`,
    slug: `demo-${prefix}-0${index}`,
    title: `Demo ${alias} Paper 0${index}`,
    authors: [`Author ${alias} ${index}`, "Template Researcher"],
    year: 2027 - index,
    summary: "用于验证论文卡片、搜索、筛选与详情页层级的示例摘要，不代表真实研究内容。",
    status: index === 1 ? "unread" : "reading",
    featured: index === 1,
    fieldIds: [field.id],
    termIds: [1, 2, 3].map((termIndex) => `term-${prefix}-0${termIndex}`),
    tags,
    sections: sharedSections,
  } satisfies PaperRecord));
});

export const terms: TermRecord[] = fields.flatMap((field) => {
  const alias = fieldAliases[field.id];
  const prefix = field.id === "embodied-intelligence" ? "embodied" : field.id.slice(3);

  return [1, 2, 3].map((index) => ({
    id: `term-${prefix}-0${index}`,
    slug: `demo-${prefix}-term-0${index}`,
    name: `${alias} 示例术语 0${index}`,
    sortKey: `${alias}-${index}`,
    definition: "用于验证术语索引、展开定义和关联论文跳转的模板说明，不是正式术语释义。",
    fieldId: field.id,
    relatedPaperIds: [`paper-${prefix}-01`, `paper-${prefix}-02`],
  } satisfies TermRecord));
});
