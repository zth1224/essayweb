# Agent-Ready README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the repository README so a future Agent can safely ingest a paper into `D:\essay`, synchronize EssayWeb, validate the result, and deploy it directly to GitHub Pages.

**Architecture:** Keep `D:\essay` as the only editable content source and `D:\essayweb` as the static-site consumer. Add a small Vitest contract that protects the critical workflow language, then replace the root README with a human-readable project introduction followed by an executable Agent runbook.

**Tech Stack:** Markdown, Astro, TypeScript, Vitest, PowerShell, GitHub Actions, GitHub Pages

---

## File map

- Modify `README.md`: project overview, Agent ingestion contract, synchronization commands, validation and direct-deployment rules.
- Create `tests/unit/readme.test.ts`: prevent accidental removal of critical source-boundary, field-mapping, validation and deployment instructions.

### Task 1: Add the README contract test

**Files:**
- Create: `tests/unit/readme.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/readme.test.ts` with:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");

describe("agent-ready README", () => {
  test("defines the source boundary and synchronized library surfaces", () => {
    expect(readme).toContain("D:\\essay");
    expect(readme).toContain("唯一内容源");
    expect(readme).toContain("bibliography/papers.csv");
    expect(readme).toContain("bibliography/paper-fields.csv");
    expect(readme).toContain("TERMS.md");
    expect(readme).toContain("topics/*.md");
  });

  test("documents every website field and the explicit mapping rule", () => {
    for (const fieldId of ["cs-ai", "cs-cl", "cs-cv", "cs-lg", "embodied-intelligence"]) {
      expect(readme).toContain(`\`${fieldId}\``);
    }
    expect(readme).toContain("禁止仅凭关键词");
  });

  test("documents the complete verified direct-deployment workflow", () => {
    for (const command of [
      "npm run sync:essay",
      "npm run check",
      "npm run test",
      "npm run test:e2e",
      "npm run build",
    ]) {
      expect(readme).toContain(command);
    }
    expect(readme).toContain("直接推送 `main`");
    expect(readme).toContain("HTTP 200");
    expect(readme).toContain("不得声称发布成功");
  });
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npx vitest run tests/unit/readme.test.ts
```

Expected: FAIL because the current README does not contain `paper-fields.csv`, all five field IDs, or the direct-deployment contract.

- [ ] **Step 3: Commit the failing contract test**

```powershell
git add -- tests/unit/readme.test.ts
git commit -m "test: define agent readme contract"
```

### Task 2: Rewrite the root README

**Files:**
- Modify: `README.md`
- Test: `tests/unit/readme.test.ts`

- [ ] **Step 1: Replace README with the Agent-ready structure**

Write these sections in this order:

1. `# 论文索引 Paper Index`
2. Public site link and a concise description of the five-field static website.
3. `## 给 Agent：先读这里` with the source boundary and a prohibition on direct edits to `src/data/generated/library.json`.
4. `## 收到一篇论文时的完整流程` covering input resolution, exact-title search, source verification, deduplication, full-note writing, synchronized source surfaces, snapshot generation, tests, commit, push and public-route verification.
5. `## D:\essay 同步单元` listing `papers/*.md`, the exact 12-column `bibliography/papers.csv`, `README.md`, `topics/*.md`, `TERMS.md`, and conditional `bibliography/paper-fields.csv`.
6. `## 领域映射` containing the five IDs and the rule that absent mappings default to embodied intelligence while keyword-only inference is forbidden.
7. `## 必须停止的情况` covering ambiguous identity, insufficient full text, duplicate conflicts, dirty website worktree, invalid CSV/links/PDF and failed tests/deployment.
8. `## 本地运行与验证`, `## 数据入口`, and `## GitHub Pages 部署` using current commands and paths.

The runbook must explicitly state:

- Accept a complete title, arXiv, DOI, official project/article page, attached PDF or local PDF.
- Exact-title matches require authoritative full text and metadata cross-checking; ambiguous results require user input.
- New papers use `已导入待精读`; repaired papers keep their number and status.
- Do not fabricate PDFs, code availability, experiments, authors or links.
- Do not publish local `D:\` paths or copy local PDFs into the snapshot.
- Run all five validation commands before deployment.
- Directly push `main` after success; use a PR only when explicitly requested.
- Wait for GitHub Pages and verify HTTP 200 plus the exact title; otherwise report the failed command/run and do not claim success.
- Avoid hard-coded paper/topic/term counts because they become stale.

- [ ] **Step 2: Run the focused README contract**

```powershell
npx vitest run tests/unit/readme.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 3: Check the README diff and Markdown hygiene**

```powershell
git diff --check -- README.md tests/unit/readme.test.ts
rg -n "^(TODO|TBD|待定)[:：]|<TODO>|<TBD>" README.md
```

Expected: `git diff --check` exits 0; `rg` exits 1 because there are no unresolved placeholders.

- [ ] **Step 4: Commit the README implementation**

```powershell
git add -- README.md
git commit -m "docs: add paper publishing runbook"
```

### Task 3: Verify and deploy the documentation change

**Files:**
- Verify: `README.md`
- Verify: `tests/unit/readme.test.ts`

- [ ] **Step 1: Run the complete local verification**

```powershell
npm run check
npm run test
npm run test:e2e
npm run build
```

Expected: Astro reports zero diagnostics, all unit and applicable browser tests pass, and the static build completes.

- [ ] **Step 2: Confirm only intended commits and files are pending for push**

```powershell
git status --short --branch
git log -3 --oneline
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
```

Expected: the branch is ahead only by the approved specification, plan, README contract test and README changes; the worktree is clean.

- [ ] **Step 3: Push the verified `main` branch**

```powershell
git push origin main
```

Expected: Git reports a successful fast-forward update of `origin/main`.

- [ ] **Step 4: Verify GitHub Pages deployment**

Open the Actions run for the pushed commit and require `verify`, `build`, and `deploy` to succeed. Then request:

```text
https://zth1224.github.io/essayweb/
```

Expected: HTTP 200. If Actions or the public route fails, report the exact failure and do not claim deployment success.
