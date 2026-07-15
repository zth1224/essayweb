import { describe, expect, test } from "vitest";
import path from "node:path";
import { buildLibrarySnapshot, parseCsvText, parsePaperMarkdown, snapshotTextChanged } from "../../scripts/lib/essay-sync";

const fixtureRoot = path.resolve(process.cwd(), "tests/fixtures/essay");

describe("essay library synchronization", () => {
  test("treats CRLF and LF snapshot output as identical", () => {
    expect(snapshotTextChanged("{\r\n  \"schemaVersion\": 1\r\n}\r\n", "{\n  \"schemaVersion\": 1\n}\n")).toBe(false);
  });

  test("parses the fixed 12-column CSV including quoted commas", () => {
    const rows = parseCsvText([
      "number,title,year,month,source_url,pdf_url,paper_path,pdf_path,pdf_status,topics,reading_status,note",
      "1,\"A title, with comma\",2025,3,https://example.com,https://example.com/a.pdf,papers/a.md,pdfs/a.pdf,ok,topic,已精读,note",
      "2,Second title,2025,4,https://example.com/b,https://example.com/b.pdf,papers/b.md,pdfs/b.pdf,ok,topic,unread,note",
    ].join("\r\n").replace("\r\n2,", "\n2,"));

    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe("A title, with comma");
    expect(Object.keys(rows[0])).toHaveLength(12);
  });

  test("keeps all ordered paper sections and recognizes damaged notes", () => {
    const complete = parsePaperMarkdown("# Title\n\n## 基本信息\n- 作者：Ada\n\n## 一句话结论\n摘要\n\n## 方法详解\n方法");
    const damaged = parsePaperMarkdown("# ?? Title\n\n## ????\n????????");

    expect(complete.authorsText).toBe("Ada");
    expect(complete.summaryMarkdown).toBe("摘要");
    expect(complete.sections.map((section) => section.title)).toEqual(["方法详解"]);
    expect(damaged.damaged).toBe(true);
  });

  test("builds a deterministic snapshot with topic recovery and safe degradation", async () => {
    const snapshot = await buildLibrarySnapshot(fixtureRoot);

    expect(snapshot.meta).toMatchObject({ paperCount: 2, topicCount: 1, termCount: 1, damagedPaperCount: 1 });
    expect(snapshot.papers[0]).toMatchObject({ title: "Sample Paper, with a Comma", status: "read", contentState: "complete" });
    expect(snapshot.papers[1]).toMatchObject({ title: "π*0.6: a VLA That Learns From Experience", status: "unread", contentState: "source-damaged" });
    expect(snapshot.papers[1].topicIds).toEqual(["embodied-foundation-models"]);
    expect(snapshot.terms.map((term) => term.name)).toEqual(["VLA (Vision-Language-Action)"]);
    expect(JSON.stringify(snapshot)).not.toContain("????????");
    expect(JSON.stringify(snapshot)).not.toContain(fixtureRoot);
  });
});
