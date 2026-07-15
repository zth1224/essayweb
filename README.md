# 论文索引 Paper Index

一个以个人论文知识管理为目标的 Astro 静态网站。首页使用五领域学科墙，分区页提供论文搜索、主题与阅读状态筛选、术语导航，并包含论文详情、术语专区和 404 页面。

当前提交的静态快照来自 `D:\essay`：具身智能分区包含 210 篇论文、7 个主题和 497 个可用术语；其余四个领域保持正式空状态。网站不复制本地 PDF，也不会把阅读状态写回源论文库。

## 本地运行

```powershell
npm install
npm run sync:essay
npm run dev
```

完整验证：

```powershell
npm run check
npm run test
npm run test:e2e
npm run build
npm run preview
```

## 数据入口

- `scripts/sync-essay.ts`：只读同步入口，默认读取 `D:\essay`。
- `scripts/lib/essay-sync.ts`：CSV、论文 Markdown、topic 与 TERMS 解析和校验。
- `src/data/generated/library.json`：可提交的静态数据快照；GitHub Actions 只读取这个文件。
- `src/data/types.ts`：领域、论文、主题、术语和同步元数据类型。
- `src/data/repository.ts`：页面统一使用的数据访问接口。

如需读取其他位置的同结构论文库：

```powershell
$env:ESSAY_ROOT = "E:\my-essay-library"
npm run sync:essay
Remove-Item Env:ESSAY_ROOT
```

相同源内容重复同步不会改写快照。同步会阻止非 12 列 CSV、缺失论文文件、重复 slug 和悬空关联；已确认的损坏论文与术语会按降级规则写入问题报告。

## GitHub Pages

工作流位于 `.github/workflows/deploy.yml`。推送到 `main` 后，官方 Astro Action 会使用已提交的快照构建并部署，不需要访问本机 D 盘；普通项目仓库会自动使用 `/<repo>/` 子路径，`<user>.github.io` 仓库使用根路径。
