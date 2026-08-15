# dsh-paper-workshop

**论文研读工坊** —— 一个 DeepSeek Harness (DSH) hybrid 插件，把「看到一篇论文 → 读明白 → 用起来」串成一条有方法、有沉淀、可续讲的研读流水线。

一句话：**对任何 arXiv 论文，免 key 检索 → 7 阶段 × 教学循环带你精读 → 档案/笔记/术语全落盘（可切 Obsidian）→ 每周自动追前沿。**

## 是什么（四层）

```
┌─────────────────────────────────────────────┐
│  ① Skill layer · paper-workshop            │  「研读这篇」「继续」统一研读流程：
│     7 阶段：筛选→鸟瞰→精读→深挖→溯源→复现→内化 │   阶段 2–3 内嵌一对一老师模式，断点续讲
├─────────────────────────────────────────────┤
│  ② Tool layer · 10 个免 key 工具            │  arxiv_search…(5 检索) + paper_card…
│     5 检索：arxiv_search arxiv_paper          │   (4 数据) + weekly_report(1 手动周报)
│       arxiv_bibtex scholar_references          │
│       scholar_citations                       │
├─────────────────────────────────────────────┤
│  ③ Data layer · 自管研读库                   │  卡片/笔记/周报/术语/PDF 五子目录；
│     ~/.dsh/paper-workshop/{cards,notes,       │  可一键切 Obsidian vault（storage.mode）
│       reports,glossary,pdfs}                  │
├─────────────────────────────────────────────┤
│  ④ UI layer · 网页面板（4 视图）             │  设置 → 插件 →「插件配置」只读卡片：
│     卡片队列 / 论文详情 / 周报 / 术语表          │  数据经 /workshop RPC 通道读取
└─────────────────────────────────────────────┘
```

## 安装

> 前置：DSH 已安装并能访问 `dsh` 命令。方式二还需要本机 Node ≥ 22.19 与 pnpm（安装时现场构建）。

### 方式一：GitHub Release 包（推荐给最终用户，预构建零依赖）

```powershell
dsh plugin --profile web add https://github.com/LessXi/dsh-paper-workshop/releases/download/v0.1.1/dsh-paper-workshop-0.1.1.tgz
```

### 方式二：源码 tar.gz（追最新 main，安装时自动构建）

```powershell
dsh plugin --profile web add https://github.com/LessXi/dsh-paper-workshop/archive/refs/heads/main.tar.gz
```

包内 `prepare` 脚本会在安装时执行 `npm run build` 现场产出 `lib/`。

### 方式三：本地开发装配（推荐给开发者）

在仓库根目录（含 `package.json` 与 `lib/`）用 DSH 的开发装配工具热加载：

```text
dev_install_package  dir = <dsh-paper-workshop 项目根>
```

装配后用 `dev_plugin_status` 核对 fiber 状态（`paper-workshop` 应处于运行态）。

### 装完之后

**方式一/二装完需重启 dsh web**（工具、技能、面板才对会话可见）；方式三热加载即时生效。插件 apply 时自动做三件事：

1. 初始化 `~/.dsh/paper-workshop/` 及其五子目录（cards / notes / reports / glossary / pdfs）；
2. 把 skill 自安装到 `~/.dsh/skills/paper-workshop/SKILL.md`（升级覆盖写）；
3. 按默认配置启动每周 arXiv 周报调度。

## 安装自检

装好重启后，跑一条命令完成大部分验收（零依赖，Node ≥ 22）：

```powershell
node scripts/verify.mjs        # 仓库内；tgz 安装的用户：
                               # node <profile>/node_modules/dsh-paper-workshop/scripts/verify.mjs
```

脚本自动检查 6 项：配置文件合法 / 研读库五个子目录 / 研读技能已安装 / 论文档案可读 / arXiv 检索通道连通 / 引文检索通道连通，输出 ✅/❌ 清单。

剩两项动嘴即可（脚本测不了）：

| # | 手动项 | 怎么验 |
|---|---|---|
| 1 | 研读流程 + 断点续讲 | 新会话说「研读这篇 <任一 arXiv 链接>」→ 应走筛选+鸟瞰并出验收卷子；中断后说「继续」应从断点续讲 |
| 2 | 周报 + 面板 | 说「跑一下周报」→ 研读库 `reports/` 应落一份周报；网页 设置→插件→论文研读工坊 可见 4 视图 |

## 配置说明

配置文件位于 `~/.dsh/paper-workshop/config.json`（首次启动自动生成）。可在对话里说「研读设置」，或直接用 `workshop_config` 工具读写。

> **研读库** = 存放你全部研读资料（论文档案/笔记/周报/术语/原文 PDF）的主文件夹。默认在 `~/.dsh/paper-workshop/`，也可以指到任何位置——包括你的 Obsidian vault。

| 段 | 键 | 默认值 | 说明 |
|---|---|---|---|
| `storage` | `mode` | `self` | 研读库放在哪：`self`（内置位置）/ `obsidian`（放进你的 Obsidian vault） |
| `storage` | `selfPath` | `~/.dsh/paper-workshop` | 内置模式下研读库的位置（`~` 展开为家目录） |
| `storage` | `obsidianPath` | `''`（空） | Obsidian 模式下你的 vault 根目录；切 `obsidian` 前必须配置 |
| `weekly` | `enabled` | `true` | 是否启用每周自动周报调度 |
| `weekly` | `cron` | `0 9 * * 1` | 触发表达式（分 时 日 月 周） |
| `weekly` | `timeZone` | `Asia/Shanghai` | 调度所依据的时区 |
| `weekly` | `categories` | `['cs.LG','cs.CL','cs.CV']` | 每周检索的 arXiv 分类 |
| `weekly` | `maxPerCategory` | `10` | 每类检索返回条数 |
| `weekly` | `cardThreshold` | `7` | 价值分达此阈值且判 later 的论文自动建档 |
| `pythonCmd` | — | `py -3.13` | 阶段 3 深挖调用的本机 Python 命令 |

周报正文写入研读库的 `reports/<YYYY-WW>-arxiv.md`（如 `2026-W31-arxiv.md`）。

## 使用短语速查

| 用户说 | 触发 |
|---|---|
| 「研读这篇 <链接/编号>」 | 进入阶段 0–1 研读流程 |
| 「继续」（或「上课」） | 跨会话从断点续讲 |
| 「研读设置」 | 读写配置（workshop_config） |
| 「跑一下周报」 | 立即执行一次每周 arXiv 周报 |
| 「我今天读什么」/「工坊状态」 | 工作台总览（workshop_overview） |

## 卸载说明

卸载插件（例如 `dsh plugin --profile web remove dsh-paper-workshop`）后，如需清理残留：

1. **Profile 装配**：从 profile 的 bundles / dependencies 移除 `dsh-paper-workshop`；
2. **skill 残留**：删除 `~/.dsh/skills/paper-workshop/`（SKILL.md 副本）；
3. **数据目录**（按需保留）：`~/.dsh/paper-workshop/` —— 内含 config.json 与你研读积累的卡片/笔记/术语，默认**不清除**，确认不再需要再手动删除；
4. 若曾切换 Obsidian 模式，添加到 vault 下的档案/笔记文件同样**默认保留**，由你自行清理。

## 构建

```powershell
pnpm install
pnpm typecheck      # 类型检查，应 exit 0
pnpm test           # 7 套单测，应对 24 项全过
pnpm build          # 编译 lib/index.js + lib/client.js + lib/types/
node scripts/smoke.mjs   # 构建产物 + ModuleLoader 装载契约冒烟，应输出 smoke ok
```

产物：`lib/index.js`（Node host 半面，ESM）+ `lib/client.js`（浏览器 client 半面，CJS factory @ `window.__ModuleLoader__.load`）+ `lib/types/`（类型声明）。

> 注意：`tsconfig.json` 的 `paths` 指向本机 DSH 安装内的 `@deepseek-ai/*` 类型包（与 dsh-polling 同款机器级做法）。克隆本仓库后如 `pnpm typecheck` 报模块找不到，把 `paths` 里的绝对路径替换为你机器上的 DSH 安装路径即可（`pnpm build` 不受影响，tsdown 已外部化这些包）。

## 已知限制（v0.1）

- **旧式 arXiv 编号**（2007 年前的 `cs/0112017`、`math.GT/0309136` 等格式）暂不能建档/建术语——档案只认 `YYMM.NNNNN[vN]` 现代格式，计划 v0.2 放宽。
- Windows 下 `pnpm test` 依赖 node --test 的 glob 行为，个别 shell 可能需逐文件运行（`node --experimental-transform-types tests/<x>.spec.ts`）。

## License

MIT © LessXi
