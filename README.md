# 论文索引 Paper Index

一个以个人论文知识管理为目标的 Astro 静态网站模板。首页使用五领域学科墙，分区页提供论文搜索、阅读状态筛选与术语导航，并包含论文详情、术语专区和 404 页面。

> 当前仓库只包含明确标注的模板示例数据，没有导入 `D:\essay` 的真实论文或术语。

## 本地运行

```powershell
npm install
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

- `src/data/types.ts`：领域、论文和术语的数据类型。
- `src/data/demo.ts`：模板示例数据。
- `src/data/repository.ts`：页面统一使用的数据访问接口。

后续接入真实论文库时，应替换或扩展数据适配层，页面组件无需重写。

## GitHub Pages

工作流位于 `.github/workflows/deploy.yml`。推送到 `main` 后，官方 Astro Action 会自动构建并部署；普通项目仓库会自动使用 `/<repo>/` 子路径，`<user>.github.io` 仓库使用根路径。
