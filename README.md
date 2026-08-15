# dsh-paper-workshop

论文研读工坊 —— DeepSeek Harness (DSH) hybrid 插件。

提供：5 个免 key 检索工具 · 7 阶段×教学循环统一 skill · 自管研读库（可切 Obsidian）· 每周 arXiv 周报 · 网页面板。

## 构建

```powershell
pnpm install
pnpm build
node scripts/smoke.mjs
```

产物：`lib/index.js`（Node host 半面，ESM）+ `lib/client.js`（浏览器 client 半面，CJS factory @ `window.__ModuleLoader__.load`）+ `lib/types/`（类型声明）。

## 结构

```
src/
  index.ts          host 插件壳
  client/index.ts   客户端壳（Task 7 填充）
scripts/smoke.mjs   构建产物 + ModuleLoader 装载契约冒烟检查
tests/              测试目录
```

## License

MIT
