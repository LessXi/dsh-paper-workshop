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

### 方式一：装的 tar.gz 包（推荐给最终用户）

在 DSH 环境执行：

```powershell
dsh plugin --profile web add <dsh-paper-workshop-0.1.0.tgz>
```

装完后无需重启即可在**设置 → 插件 → 插件配置**看到网页面板。插件 apply 时自动做三件事：

1. 初始化 `~/.dsh/paper-workshop/` 及其五子目录（cards / notes / reports / glossary / pdfs）；
2. 把 skill 自安装到 `~/.dsh/skills/paper-workshop/SKILL.md`（升级覆盖写）；
3. 按默认配置启动每周 arXiv 周报调度。

### 方式二：本地开发装配（推荐给开发者）

在仓库根目录（含 `package.json` 与 `lib/`）用 DSH 的开发装配工具热加载：

```text
dev_install_package  dir = <dsh-paper-workshop 项目根>
```

装配后用 `dev_plugin_status` 核对 fiber 状态（`paper-workshop` 应处于运行态）。

## 验收自检清单

安装后可逐条自检（对照设计 §12）：

| # | 验收项 | 自检方法 |
|---|---|---|
| 1 | 工具可调用 | 新会话确认 `arxiv_search` 等 **5 检索 + 4 数据 + 1 手动周报**共 10 个工具可用；`~/.dsh/paper-workshop/` 与五子目录已自动创建；设置→插件→面板 **4 视图**可见 |
| 2 | 研读走通阶段 0–1 | 丢 arXiv 链接说「研读这篇 <链接/编号>」，阶段 0–1 走完出 GenUI 卷子；档案三行（title/one_line/status 等）落盘 |
| 3 | 「继续」跨会话续讲 | 阶段 2 结束后说「继续」，能跨会话从断点小节续讲（断点正确读写） |
| 4 | 周报触发落盘 + 建卡 | 说「跑一下周报」→ `weekly_report` 派发任务会话 → `reports/<YYYY-WW>-arxiv.md` 落盘 + 高分论文自动建卡 |
| 5 | obsidian 切换 | `workshop_config` set 切 obsidian 模式（指向临时 vault 目录）→ `workshop_overview` 的 `dataRoot` 随之变化 |
| 6 | 术语表可见 | 精读攒新词 → `glossary/` 落卡 → 面板「术语表」可见 |

## 配置说明

配置文件位于 `~/.dsh/paper-workshop/config.json`（首次启动自动生成）。可在对话里说「研读设置」，或直接用 `workshop_config` 工具读写。

| 段 | 键 | 默认值 | 说明 |
|---|---|---|---|
| `storage` | `mode` | `self` | 数据根模式：`self`（自管）/ `obsidian`（切 Obsidian vault） |
| `storage` | `selfPath` | `~/.dsh/paper-workshop` | self 模式的数据根（`~` 展开为家目录） |
| `storage` | `obsidianPath` | `''`（空） | obsidian 模式的 vault 根目录；切 obsidian 前必须配置 |
| `weekly` | `enabled` | `true` | 是否启用每周自动周报调度 |
| `weekly` | `cron` | `0 9 * * 1` | 触发表达式（分 时 日 月 周） |
| `weekly` | `timeZone` | `Asia/Shanghai` | 调度所依据的时区 |
| `weekly` | `categories` | `['cs.LG','cs.CL','cs.CV']` | 每周检索的 arXiv 分类 |
| `weekly` | `maxPerCategory` | `10` | 每类检索返回条数 |
| `weekly` | `cardThreshold` | `7` | 价值分达此阈值且判 later 的论文自动建卡 |
| `pythonCmd` | — | `py -3.13` | 阶段 3 深挖调用的本机 Python 命令 |

周报正文写入 `<数据根>/reports/<YYYY-WW>-arxiv.md`（如 `2026-W31-arxiv.md`）。

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

## License

MIT © LessXi
