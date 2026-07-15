import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

const CSV_HEADERS = [
  "number", "title", "year", "month", "source_url", "pdf_url",
  "paper_path", "pdf_path", "pdf_status", "topics", "reading_status", "note",
] as const;

type CsvRow = Record<(typeof CSV_HEADERS)[number], string>;

export interface ParsedPaperSection {
  id: string;
  title: string;
  markdown: string;
}

export interface ParsedPaperMarkdown {
  title: string;
  authorsText: string;
  summaryMarkdown: string;
  sections: ParsedPaperSection[];
  damaged: boolean;
}

const containsDamage = (value: string) => /\?{2,}/.test(value);
const stripMd = (value: string) => value.trim().replace(/^\s+|\s+$/g, "");
const paperSlugFromPath = (value: string) => path.posix.basename(value.replaceAll("\\", "/"), ".md");

const slugify = (value: string) => value
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")
  .slice(0, 64);

const stableId = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 10);

export const snapshotTextChanged = (previous: string, next: string) =>
  previous.replace(/\r\n/g, "\n") !== next.replace(/\r\n/g, "\n");

export const parseCsvText = (text: string): CsvRow[] => {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r?\n/g, "\n");
  const records = parse(normalized, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: false,
    trim: false,
    record_delimiter: "\n",
  }) as CsvRow[];

  const headerLine = normalized.split("\n", 1)[0] ?? "";
  const headers = parse(headerLine, { relax_quotes: false })[0] as string[];
  if (headers.length !== CSV_HEADERS.length || headers.some((header, index) => header !== CSV_HEADERS[index])) {
    throw new Error(`papers.csv must use the fixed ${CSV_HEADERS.length}-column schema`);
  }
  return records;
};

const sectionBlocks = (markdown: string) => {
  const matches = [...markdown.matchAll(/^##\s+(.+)\s*$/gm)];
  return matches.map((match, index) => ({
    title: match[1].trim(),
    markdown: markdown.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? markdown.length).trim(),
  }));
};

export const parsePaperMarkdown = (markdown: string): ParsedPaperMarkdown => {
  const title = markdown.match(/^#\s+(.+)\s*$/m)?.[1]?.trim() ?? "";
  const damaged = containsDamage(markdown);
  const blocks = sectionBlocks(markdown);
  const basic = blocks.find((block) => block.title === "基本信息")?.markdown ?? "";
  const authorsText = basic.match(/^\s*-\s*(?:作者(?:\s*\/\s*机构)?|机构\s*\/\s*团队)\s*[:：]\s*(.+)$/m)?.[1]?.trim() ?? "";
  const summaryMarkdown = blocks.find((block) => block.title === "一句话结论")?.markdown.trim() ?? "";
  const sections = damaged ? [] : blocks
    .filter((block) => block.title !== "基本信息" && block.title !== "一句话结论")
    .map((block, index) => ({
      id: slugify(block.title) || `section-${index + 1}`,
      title: block.title,
      markdown: stripMd(block.markdown),
    }));

  return { title, authorsText, summaryMarkdown, sections, damaged };
};

const extractBlock = (markdown: string, heading: string) => {
  const blocks = sectionBlocks(markdown);
  return blocks.find((block) => block.title === heading)?.markdown.trim() ?? "";
};

const parseTopicMarkdown = (fileName: string, markdown: string) => ({
  id: path.basename(fileName, ".md"),
  slug: path.basename(fileName, ".md"),
  title: markdown.match(/^#\s+(.+)\s*$/m)?.[1]?.trim() ?? path.basename(fileName, ".md"),
  descriptionMarkdown: extractBlock(markdown, "主题定位"),
  readingRouteMarkdown: extractBlock(markdown, "阅读路线"),
  paperIds: [...markdown.matchAll(/\]\((?:\.\.\/)?papers\/([^/)]+)\.md\)/g)].map((match) => match[1]),
});

const valueAfterLabel = (block: string, label: string) => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return block.match(new RegExp(`^\\s*-\\s*${escaped}\\s*[:：]\\s*(.+)$`, "m"))?.[1]?.trim() ?? "";
};

const parseTermsMarkdown = (markdown: string) => {
  const rawBlocks = markdown.split(/^###\s+/m).slice(1);
  const terms: Array<{
    id: string; slug: string; name: string; sortKey: string;
    definitionMarkdown: string; contextMarkdown: string;
    fieldId: "embodied-intelligence"; relatedPaperIds: string[];
  }> = [];
  const issues: Array<{ level: "warning"; code: string; sourcePath: string; message: string }> = [];

  for (const rawBlock of rawBlocks) {
    const [nameLine = "", ...bodyLines] = rawBlock.split(/\r?\n/);
    const name = nameLine.trim();
    const body = bodyLines.join("\n");
    if (containsDamage(rawBlock)) {
      issues.push({ level: "warning", code: "DAMAGED_TERM", sourcePath: "TERMS.md", message: name || "Unnamed damaged term" });
      continue;
    }
    const definitionMarkdown = valueAfterLabel(body, "中文解释");
    const contextMarkdown = valueAfterLabel(body, "在本知识库中的语境");
    if (!name || !definitionMarkdown) continue;
    const hash = stableId(name);
    terms.push({
      id: `term-${hash}`,
      slug: `${slugify(name) || "term"}-${hash.slice(0, 6)}`,
      name,
      sortKey: /^[a-z]/i.test(name) ? name[0].toUpperCase() : "#",
      definitionMarkdown,
      contextMarkdown,
      fieldId: "embodied-intelligence",
      relatedPaperIds: [...body.matchAll(/\]\(papers\/([^/)]+)\.md\)/g)].map((match) => match[1]),
    });
  }
  return { terms, issues, blockCount: rawBlocks.length };
};

const parseRecentPaperIds = (markdown: string) => {
  const recent = extractBlock(markdown, "最近导入");
  return [...recent.matchAll(/\]\(papers\/([^/)]+)\.md\)/g)].map((match) => match[1]).slice(0, 6);
};

const safeNumber = (value: string) => /^\d+$/.test(value.trim()) ? Number(value) : undefined;
const safeHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim()) ? value.trim() : undefined;

export const buildLibrarySnapshot = async (sourceRoot: string) => {
  const inputPaths = ["bibliography/papers.csv", "README.md", "TERMS.md"];
  for (const relativePath of inputPaths) {
    if (!existsSync(path.join(sourceRoot, relativePath))) throw new Error(`Missing source file: ${relativePath}`);
  }

  const csvText = readFileSync(path.join(sourceRoot, "bibliography/papers.csv"), "utf8");
  const rows = parseCsvText(csvText);
  const slugs = rows.map((row) => paperSlugFromPath(row.paper_path));
  if (new Set(slugs).size !== slugs.length) throw new Error("Duplicate paper slug in papers.csv");

  const topicDir = path.join(sourceRoot, "topics");
  const topicFiles = readdirSync(topicDir).filter((file) => file.endsWith(".md")).sort();
  const topics = topicFiles.map((file) => parseTopicMarkdown(file, readFileSync(path.join(topicDir, file), "utf8")));
  const topicIdsByPaper = new Map<string, string[]>();
  for (const topic of topics) {
    for (const paperId of topic.paperIds) topicIdsByPaper.set(paperId, [...(topicIdsByPaper.get(paperId) ?? []), topic.id]);
  }

  const readme = readFileSync(path.join(sourceRoot, "README.md"), "utf8");
  const recentPaperIds = parseRecentPaperIds(readme);
  const issues: Array<{ level: "warning"; code: string; sourcePath: string; message: string }> = [];

  const papers = rows.map((row) => {
    const slug = paperSlugFromPath(row.paper_path);
    const relativePaperPath = row.paper_path.replaceAll("\\", "/");
    const absolutePaperPath = path.join(sourceRoot, relativePaperPath);
    if (!existsSync(absolutePaperPath)) throw new Error(`Missing paper note: ${relativePaperPath}`);
    const parsed = parsePaperMarkdown(readFileSync(absolutePaperPath, "utf8"));
    const damaged = parsed.damaged;
    if (damaged) issues.push({ level: "warning", code: "DAMAGED_PAPER", sourcePath: relativePaperPath, message: "Source note contains replacement question marks" });
    const recentIndex = recentPaperIds.indexOf(slug);
    const csvTitle = row.title.trim();
    const title = slug === "2025-pi-star-0-6-vla-learns-from-experience"
      ? "π*0.6: a VLA That Learns From Experience"
      : (!containsDamage(parsed.title) && parsed.title ? parsed.title : csvTitle.replace(/\?{2,}/g, ""));

    return {
      id: slug,
      slug,
      sourceNumber: Number(row.number),
      title,
      authorsText: damaged ? "作者信息待修复" : (parsed.authorsText || "作者信息待补充"),
      year: safeNumber(row.year),
      month: safeNumber(row.month),
      summaryMarkdown: damaged ? "源笔记内容损坏，待修复后补充。" : parsed.summaryMarkdown,
      status: row.reading_status.trim() === "已精读" ? "read" as const : "unread" as const,
      fieldIds: ["embodied-intelligence" as const],
      topicIds: topicIdsByPaper.get(slug) ?? [],
      termIds: [] as string[],
      sourceUrl: safeHttpUrl(row.source_url) ?? "",
      pdfUrl: safeHttpUrl(row.pdf_url),
      contentState: damaged ? "source-damaged" as const : "complete" as const,
      recentRank: recentIndex >= 0 ? recentIndex + 1 : undefined,
      sections: damaged ? [] : parsed.sections,
    };
  });

  const paperIds = new Set(papers.map((paper) => paper.id));
  for (const topic of topics) {
    const dangling = topic.paperIds.filter((paperId) => !paperIds.has(paperId));
    if (dangling.length) throw new Error(`Dangling topic relationships in ${topic.id}: ${dangling.join(", ")}`);
  }

  const termsResult = parseTermsMarkdown(readFileSync(path.join(sourceRoot, "TERMS.md"), "utf8"));
  issues.push(...termsResult.issues);
  const terms = termsResult.terms;
  for (const term of terms) {
    const dangling = term.relatedPaperIds.filter((paperId) => !paperIds.has(paperId));
    if (dangling.length) throw new Error(`Dangling term relationships in ${term.name}: ${dangling.join(", ")}`);
  }
  const termIdsByPaper = new Map<string, string[]>();
  for (const term of terms) for (const paperId of term.relatedPaperIds) termIdsByPaper.set(paperId, [...(termIdsByPaper.get(paperId) ?? []), term.id]);
  for (const paper of papers) paper.termIds = termIdsByPaper.get(paper.id) ?? [];

  const referenced = new Set(slugs);
  for (const file of readdirSync(path.join(sourceRoot, "papers")).filter((file) => file.endsWith(".md"))) {
    const slug = path.basename(file, ".md");
    if (!referenced.has(slug)) issues.push({ level: "warning", code: "UNREFERENCED_PAPER", sourcePath: `papers/${file}`, message: "Markdown note is not referenced by papers.csv" });
  }

  const hash = createHash("sha256");
  const trackedPaths = [
    ...inputPaths,
    ...topicFiles.map((file) => `topics/${file}`),
    ...rows.map((row) => row.paper_path.replaceAll("\\", "/")),
  ].sort();
  let latestMtime = 0;
  for (const relativePath of trackedPaths) {
    const absolutePath = path.join(sourceRoot, relativePath);
    hash.update(relativePath).update("\0").update(readFileSync(absolutePath)).update("\0");
    latestMtime = Math.max(latestMtime, statSync(absolutePath).mtimeMs);
  }

  return {
    schemaVersion: 1,
    meta: {
      sourceHash: hash.digest("hex"),
      sourceUpdatedAt: new Date(latestMtime).toISOString(),
      paperCount: papers.length,
      topicCount: topics.length,
      termCount: terms.length,
      damagedPaperCount: papers.filter((paper) => paper.contentState === "source-damaged").length,
      readPaperCount: papers.filter((paper) => paper.status === "read").length,
      sourceFiles: {
        csvRows: rows.length,
        paperNotes: rows.length,
        topicPages: topicFiles.length,
        termBlocks: termsResult.blockCount,
        recentEntries: recentPaperIds.length,
      },
    },
    papers,
    topics,
    terms,
    issues,
  };
};
