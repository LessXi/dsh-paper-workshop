#!/usr/bin/env node
/**
 * 论文研读工坊 · 安装自检脚本（零依赖，Node ≥ 22）
 *
 * 用法：
 *   仓库内：      node scripts/verify.mjs
 *   tgz 安装后：  node <profile>/node_modules/dsh-paper-workshop/scripts/verify.mjs
 *   （AI 会话里说「研读工坊体检」也可让 AI 跑本脚本）
 *
 * 自动检查 6 项 + 打印 2 项手动检查提示。全部通过退出码 0。
 */
import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const results = []
function report(ok, name, detail) {
  results.push({ ok, name, detail })
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const home = join(homedir(), '.dsh')
const workshopHome = join(home, 'paper-workshop')

// ── 1. 配置文件合法 ─────────────────────────────────────────────
let cfg = null
try {
  cfg = JSON.parse(await readFile(join(workshopHome, 'config.json'), 'utf8'))
  const w = cfg.weekly ?? {}
  const s = cfg.storage ?? {}
  const cronOk = typeof w.cron === 'string' && w.cron.trim().split(/\s+/).length === 5
  if (!cronOk) throw new Error('weekly.cron 不是 5 段表达式')
  if (s.mode !== 'self' && s.mode !== 'obsidian') throw new Error(`storage.mode 非法：${s.mode}`)
  if (s.mode === 'obsidian' && !s.obsidianPath) throw new Error('obsidian 模式但 obsidianPath 为空')
  report(true, '配置文件', `mode=${s.mode} cron="${w.cron}" 周一${w.timeZone ?? ''} 阈值${w.cardThreshold}`)
} catch (e) {
  report(false, '配置文件', `${join(workshopHome, 'config.json')} 无法解析或字段缺失：${e.message}`)
}

// ── 2. 研读库目录结构 ───────────────────────────────────────────
const dataRoot = resolve(cfg?.storage?.mode === 'obsidian'
  ? cfg.storage.obsidianPath
  : (cfg?.storage?.selfPath ?? '~/.dsh/paper-workshop').replace(/^~(?=[/\\])/, homedir()))
const missing = []
for (const sub of ['cards', 'notes', 'reports', 'glossary', 'pdfs']) {
  try { await access(join(dataRoot, sub), constants.F_OK) } catch { missing.push(sub) }
}
if (missing.length === 0) report(true, '研读库目录', dataRoot)
else report(false, '研读库目录', `${dataRoot} 缺子目录：${missing.join('/')}`)

// ── 3. 技能已自安装 ─────────────────────────────────────────────
try {
  const skill = await readFile(join(home, 'skills', 'paper-workshop', 'SKILL.md'), 'utf8')
  if (!skill.includes('name: paper-workshop')) throw new Error('frontmatter 缺 name: paper-workshop')
  report(true, '研读技能', `~/.dsh/skills/paper-workshop/SKILL.md（${skill.length} 字节）`)
} catch (e) {
  report(false, '研读技能', `技能未安装或损坏：${e.message}`)
}

// ── 4. 论文档案可读（有档案则抽查第一篇的 frontmatter）────────────
try {
  const cards = (await readdir(join(dataRoot, 'cards'))).filter(f => f.endsWith('.md'))
  if (cards.length === 0) report(true, '论文档案', '研读库为空（还没有论文，正常）')
  else {
    const first = await readFile(join(dataRoot, 'cards', cards[0]), 'utf8')
    if (!first.startsWith('---') || !first.includes('arxiv:')) throw new Error(`${cards[0]} frontmatter 异常`)
    report(true, '论文档案', `${cards.length} 篇，抽查 ${cards[0]} 通过`)
  }
} catch (e) {
  report(false, '论文档案', e.message)
}

// ── 5. arXiv API 连通 ───────────────────────────────────────────
try {
  const res = await fetch('https://export.arxiv.org/api/query?id_list=1805.12114&max_results=1', {
    signal: AbortSignal.timeout(20000),
  })
  const xml = await res.text()
  if (!res.ok || !xml.includes('<entry>')) throw new Error(`HTTP ${res.status} / 无 <entry>`)
  report(true, 'arXiv 检索通道', 'export.arxiv.org 可达（实测返回 PETS 元数据）')
} catch (e) {
  report(false, 'arXiv 检索通道', `不可达：${e.message}`)
}

// ── 6. Semantic Scholar 连通（429 视为可达=限流）─────────────────
try {
  const res = await fetch('https://api.semanticscholar.org/graph/v1/paper/ARXIV:1805.12114?fields=title', {
    headers: { 'User-Agent': 'paper-workshop-verify' },
    signal: AbortSignal.timeout(20000),
  })
  if (res.status === 429) report(true, '引文检索通道', 'Semantic Scholar 可达（当前限流 429，功能会自动重试）')
  else if (res.ok) report(true, '引文检索通道', 'Semantic Scholar 可达')
  else throw new Error(`HTTP ${res.status}`)
} catch (e) {
  report(false, '引文检索通道', `不可达：${e.message}（溯源功能会降级 web_search）`)
}

// ── 汇总 + 手动项 ───────────────────────────────────────────────
const failed = results.filter(r => !r.ok).length
console.log('')
if (failed === 0) {
  console.log(`🎉 全部 ${results.length} 项自动检查通过。`)
} else {
  console.log(`⚠️ ${failed}/${results.length} 项未通过 —— 按上面 ❌ 行的提示处理。`)
}
console.log('')
console.log('以下 2 项需要人在对话里体验（脚本测不了）：')
console.log('  ① 新开会话说「研读这篇 <任一 arXiv 链接>」→ 应走筛选+鸟瞰并出验收卷子；中断后说「继续」应能续讲。')
console.log('  ② 说「跑一下周报」→ 应生成任务会话并在研读库 reports/ 落一份周报；网页 设置→插件→论文研读工坊 可见 4 视图。')
process.exit(failed === 0 ? 0 : 1)
