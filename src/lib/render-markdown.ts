import { Marked } from "marked";
import markedKatex from "marked-katex-extension";
import sanitizeHtml from "sanitize-html";

interface RenderMarkdownOptions {
  base?: string;
}

const normalizeBase = (base: string) => `/${base.split("/").filter(Boolean).join("/")}${base === "/" ? "" : "/"}`;

export const renderMarkdown = (markdown: string, options: RenderMarkdownOptions = {}) => {
  if (!markdown.trim()) return "";
  const marked = new Marked(markedKatex({ throwOnError: false, nonStandard: false, strict: "ignore" }));
  const rendered = marked.parse(markdown, { async: false }) as string;
  const base = normalizeBase(options.base ?? import.meta.env.BASE_URL ?? "/");

  return sanitizeHtml(rendered, {
    allowedTags: [
      "p", "br", "strong", "em", "del", "blockquote", "ul", "ol", "li",
      "pre", "code", "a", "h2", "h3", "h4", "hr", "sup", "sub", "span",
      "math", "semantics", "annotation", "mrow", "mi", "mn", "mo", "msup",
      "msub", "mfrac", "mtext", "mspace", "mtable", "mtr", "mtd",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      code: ["class"],
      span: ["class", "aria-hidden", "style"],
      math: ["xmlns"],
      annotation: ["encoding"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attributes) => {
        const termsMatch = attributes.href?.match(/^(?:\.\.\/)?TERMS\.md(?:#.*)?$/i);
        const paperMatch = attributes.href?.match(/^(?:(?:\.\.\/)?papers\/)?([^/#]+)\.md(?:#.*)?$/);
        const href = termsMatch
          ? `${base}terms/embodied-intelligence/`
          : paperMatch ? `${base}papers/${paperMatch[1]}/` : attributes.href;
        const external = /^https?:\/\//i.test(href ?? "");
        return {
          tagName: "a",
          attribs: {
            ...attributes,
            ...(href ? { href } : {}),
            ...(external ? { target: "_blank", rel: "noreferrer noopener" } : {}),
          },
        };
      },
    },
  });
};
