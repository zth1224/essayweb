import { describe, expect, test } from "vitest";
import { renderMarkdown } from "../../src/lib/render-markdown";

describe("safe Markdown rendering", () => {
  test("renders lists, code, math and safe links while removing raw HTML", () => {
    const html = renderMarkdown([
      "- **关键点**",
      "",
      "```python",
      "print('ok')",
      "```",
      "",
      "公式 $a^2+b^2$",
      "",
      "[项目](https://example.com) [论文](../papers/sample-paper.md) [同目录](another-paper.md) [术语](../TERMS.md#sample)",
      "",
      "<script>alert('x')</script><iframe src='bad'></iframe>",
    ].join("\n"), { base: "/paper-index/" });

    expect(html).toContain("<ul>");
    expect(html).toContain("language-python");
    expect(html).toContain("katex");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain('href="/paper-index/papers/sample-paper/"');
    expect(html).toContain('href="/paper-index/papers/another-paper/"');
    expect(html).toContain('href="/paper-index/terms/embodied-intelligence/"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
  });
});
