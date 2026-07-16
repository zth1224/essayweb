# 论文索引 Paper Index

[访问公开网站](https://zth1224.github.io/essayweb/)

一个面向个人论文知识管理的 Astro 静态网站。首页以五领域学科墙组织内容，分区页提供论文搜索、主题与阅读状态筛选、术语导航，并包含论文详情、术语专区和 404 页面。

网站内容由本地论文库生成，阅读状态仅保存在当前浏览器，不会写回源库。GitHub Pages 只部署文本和静态资源，不复制本地 PDF。

## 给 Agent：先读这里

`D:\essay` 是论文内容的**唯一内容源**，`D:\essayweb` 是网站代码和可公开提交的静态快照。

添加或修复论文时：

- 先读取 `D:\essay\AGENTS.md`、模板和相关源文件，以当前格式为准。
- 所有论文内容先写入 `D:\essay`，再运行同步命令生成网站快照。
- 不要直接编辑 `D:\essayweb\src\data\generated\library.json` 中的论文内容。
- 不修改或删除无关文件，不覆盖用户已有改动，不改写源库中的历史编号和阅读状态。
- 全部检查通过后默认直接推送 `main` 并等待公开部署；只有用户明确要求审查时才创建 PR。

## 收到一篇论文时的完整流程

### 1. 确定可信来源

可接受的输入包括：

- 完整论文标题
- arXiv、DOI、出版社、会议或官方项目页链接
- 内容完整的文章网页
- 用户附件 PDF 或本地 PDF

只有标题时，先用完整标题精确搜索。统一 Unicode、大小写和多余空格后，要求候选标题完整匹配；优先使用 arXiv、出版社、会议论文页、作者项目页等权威来源，并交叉核对作者、日期、DOI 或 arXiv ID。

只有一个无歧义的匹配且能获得可信全文时可以继续。没有精确匹配、存在多个冲突候选或身份仍不明确时，列出候选并询问用户，禁止猜测论文。

仅有摘要、新闻稿或不完整网页时，不足以编写完整精读卡，应向用户索要全文。不得补写来源未报告的实验、作者、机构、代码、数据、模型或链接；`Coming Soon` 必须保留原有限定。

### 2. 去重并判断操作类型

在修改文件前，使用以下信息搜索 `bibliography/papers.csv`、论文文件名、README、topic、TERMS 和现有网站快照：

- arXiv ID（忽略版本号后再比较）
- DOI
- 规范化后的 `source_url` 和 `pdf_url`
- 完整标题
- 预期论文文件名和 slug

结果只能是：

- `add`：没有现有记录，使用下一个编号。
- `repair`：已有记录但笔记、PDF 元数据、链接或同步面不完整；保留原编号和阅读状态。
- `already published`：完整记录和公开页面都已存在；直接返回现有页面，不重复添加。

不同标识指向不同记录时必须停止并报告冲突，不能自行选择覆盖对象。

### 3. 写完整中文精读卡

论文 Markdown 应遵循 `D:\essay\templates\paper-note-template.md`，至少包含：

- 标题、作者/机构、日期、来源、PDF，以及真实存在的项目、代码、数据和模型链接
- 一句话结论
- 研究背景与问题定义
- 方法与关键技术机制
- 实验设置、基线、指标、定量结果和原文实际提供的消融
- 贡献与创新
- 局限和适用边界
- 与库内论文、主题和术语的关系
- 阅读备注、可执行启发和后续问题

以中文归纳，不大段复制原文，并明确区分论文报告的事实与 Agent 的解释。新论文状态使用 `已导入待精读`，不能冒充用户已经精读。

有正式 PDF 时可保存或复制到 `D:\essay\pdfs`，但不能移动、覆盖用户原件。下载失败或官方 PDF 不可用时保持 `pdf_path` 为空，不能伪造本地路径或假 PDF。

### 4. 同步 `D:\essay` 的完整单元

一次论文导入通常需要同步以下文件：

1. `papers/*.md`：完整论文笔记。
2. `bibliography/papers.csv`：严格保持现有 12 列表头，每行必须可解析为 12 列。
3. `README.md`：更新最近导入和从实际文件计算出的统计。
4. `topics/*.md`：只加入有依据的相关主题，不凭空创建分类体系。
5. `TERMS.md`：维护必要术语、库内语境和有效论文关联。
6. `bibliography/paper-fields.csv`：论文不属于默认具身智能分区时，添加显式网站领域映射。

CSV 字段含逗号、双引号或多个主题时必须正确引用。topic、TERMS 和 README 中的本地 Markdown 链接必须指向实际存在的论文笔记。

### 5. 验证源论文库

同步网站前至少确认：

- `papers.csv` 表头和每行均为严格 12 列。
- 编号、slug、来源标识和论文路径没有重复。
- 每个 `paper_path`、非空 `pdf_path` 和本地 Markdown 链接真实存在。
- 非空 PDF 文件以有效 `%PDF-` 文件头开头。
- README 中的论文/PDF 数量来自真实 CSV 行和有效 PDF 文件。
- topic 与 TERMS 不含悬空或重复关联。
- 目标笔记没有连续问号损坏、虚构内容或未完成占位符。
- 公开数据中不会出现本地 `D:\` 绝对路径或本地 PDF 文件。

任一检查失败时先修复；无法安全修复时报告具体文件和原因并停止发布。

### 6. 生成网站快照

在网站仓库根目录运行：

```powershell
cd D:\essayweb
git status --short --branch
npm run sync:essay
```

同步器默认只读 `D:\essay`，生成 `src/data/generated/library.json`。正常的单篇内容导入通常只应改变该快照；如果同步脚本或页面代码也发生变化，必须说明原因并单独验证。

如需读取其他位置的同结构论文库：

```powershell
$env:ESSAY_ROOT = "E:\my-essay-library"
npm run sync:essay
Remove-Item Env:ESSAY_ROOT
```

相同源内容重复同步不应产生无意义快照差异。

### 7. 完整验证

发布前依次执行：

```powershell
npm run check
npm run test
npm run test:e2e
npm run build
```

所有命令都必须成功。还要检查：

```powershell
git diff --check
git status --short --branch
git diff --stat
```

只提交与本次论文相关的文件。不要使用 reset、强制推送或覆盖方式处理用户已有改动。

### 8. 直接部署并验证公开页面

验证通过后提交网站快照，并默认直接推送 `main`：

```powershell
git add -- src/data/generated/library.json
git commit -m "content: add <paper-slug>"
git push origin main
```

随后等待 `.github/workflows/deploy.yml` 的 `verify`、`build`、`deploy` 全部成功，并实际请求：

```text
https://zth1224.github.io/essayweb/papers/<paper-slug>/
```

公开页面必须返回 HTTP 200 且包含正确完整标题。GitHub Actions 失败、页面不是 HTTP 200 或标题不匹配时，必须返回具体失败命令、工作流地址和错误信息，**不得声称发布成功**。

## 领域映射

网站支持五个领域 ID：

| 网站分区 | Field ID |
| --- | --- |
| 人工智能 | `cs-ai` |
| 计算与语言 | `cs-cl` |
| 计算机视觉与模式识别 | `cs-cv` |
| 机器学习 | `cs-lg` |
| 具身智能 | `embodied-intelligence` |

没有写入 `bibliography/paper-fields.csv` 的论文默认进入 `embodied-intelligence`。用户明确指定分区时按用户要求映射；否则只依据源库中的明确分类。**禁止仅凭关键词**推测论文属于额外分区。

`paper-fields.csv` 使用固定表头：

```csv
paper_path,fields
papers/2026-example.md,cs-ai
```

同一论文确有多个明确分区时，使用 `;` 分隔 Field ID。映射中的论文路径必须存在，Field ID 必须来自上表。

## 必须停止的情况

遇到以下任一情况，不提交、不推送：

- 无法获得足够全文，不能完成可靠精读卡。
- 标题搜索不唯一或不同标识指向冲突记录。
- 网站不在干净的 `main`，或存在不属于当前任务的改动。
- CSV 列数、编号、slug、文件路径、PDF 文件头或 Markdown 关联校验失败。
- 同步结果包含本地绝对路径、损坏问号正文或未解释的额外改动。
- 类型检查、单元测试、浏览器测试或构建失败。
- GitHub Pages 工作流失败，或公开页面无法验证。

停止时说明已完成的步骤、具体阻断文件和安全的下一步，不要静默跳过检查。

## 本地运行与验证

首次运行：

```powershell
npm install
npm run sync:essay
npm run dev
```

完整验证与预览：

```powershell
npm run check
npm run test
npm run test:e2e
npm run build
npm run preview
```

## 数据与代码入口

- `scripts/sync-essay.ts`：只读同步入口，默认读取 `D:\essay`。
- `scripts/lib/essay-sync.ts`：解析并校验 CSV、论文 Markdown、topic、TERMS 和领域映射。
- `src/data/generated/library.json`：可提交的静态数据快照；由同步脚本生成，不手工维护论文内容。
- `src/data/types.ts`：领域、论文、主题、术语和同步元数据类型。
- `src/data/repository.ts`：页面使用的统一数据访问接口。
- `tests/unit/essay-sync.test.ts`：同步器和损坏降级规则测试。
- `tests/unit/readme.test.ts`：本 README 的 Agent 工作流契约测试。

## 论文发现工作台

`/discover/` 是站内的具身智能论文发现入口。正式精读库仍只来自 `D:\essay`；发现页候选箱使用浏览器 `localStorage`，不会直接写回论文库。

刷新候选数据：

```powershell
npm run refresh:discovery
```

脚本以 arXiv 为必须来源，并用 Semantic Scholar 和 OpenReview 补充元数据。`SEMANTIC_SCHOLAR_API_KEY` 是可选环境变量；未配置时会使用未认证接口并严格限速。候选保留最近 730 天；发布超过 180 天的论文只有在兴趣匹配至少 9、证据成熟度至少 8、信息完整度至少 11 时才进入快照。刷新结果写入 `src/data/generated/discovery.json`，只有内容实际变化时才应提交。

`.github/workflows/refresh-discovery.yml` 在北京时间工作日 11:30 自动刷新，也支持手动触发。arXiv 失败、候选异常缩减、重复身份或 schema 校验失败时保留旧快照；Semantic Scholar/OpenReview 暂时失败时页面继续使用旧增强数据并显示来源延迟。

发现页实现入口：

- `scripts/refresh-discovery.ts`：刷新命令入口。
- `scripts/lib/discovery-refresh.ts`：多来源解析、去重、评分和快照保护。
- `src/data/generated/discovery.json`：可提交的静态发现快照。
- `src/pages/discover.astro`：研究编辑台页面。
- `src/scripts/discovery-client.ts`：搜索、筛选、候选箱和本地反馈。

## GitHub Pages

部署工作流位于 `.github/workflows/deploy.yml`。推送到 `main` 后，GitHub Actions 使用仓库中已提交的快照执行验证、静态构建和 Pages 部署，不访问本机 D 盘。

普通项目仓库自动使用 `/<repo>/` 子路径，`<user>.github.io` 仓库使用根路径。仓库内不硬编码会频繁变化的论文、主题和术语数量；需要统计时运行 `npm run sync:essay` 或读取当前快照元数据。
