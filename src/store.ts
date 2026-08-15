/** markdown 档案存储：极简 frontmatter 解析/序列化 + 档案/术语卡/周报的读写。零依赖。 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureDataRoot } from './config.ts'

export { ensureDataRoot }

// ---------- arXiv 编号守卫 ----------
// 严格形态：4-5位分类号 . 4-5位序列号，可选 vN 版本后缀。全部现有测试中经 cardPath
// 的 id（2608.00001/00002/00003）均通过，故采用更严格的防路径逃逸形态。
const ARXIV_ID_RE = /^[\d]{4,5}\.[\d]{4,5}(v\d+)?$/
function assertArxivId(arxiv: string): void {
  if (!ARXIV_ID_RE.test(arxiv)) throw new Error(`非法 arXiv 编号：${arxiv}`)
}

export interface ReviewItem { concept: string; added: string; source: string }
/** 复现清单进度（进入复现阶段后逐项打勾，对话里口头更新）。 */
export interface ReproState { env: boolean; code: boolean; results: boolean; note: string }
export interface PaperCard {
  arxiv: string; title: string; authors: string; year: string; venue: string
  status: 'skipped' | 'later' | 'reading' | 'done'
  score: number; one_line: string; stage: number; source_week: string
  review: ReviewItem[]; questions: string[]; tags: string[]
  repro: ReproState
  body: string // 正文（含 ## 断点 小节）
}
export interface GlossaryTerm { slug: string; zh: string; en: string; plain: string; first_seen: string; related: string[] }
export interface ReportMeta { week: string; path: string; mtimeMs: number }

const CARD_FIELDS = ['arxiv', 'title', 'authors', 'year', 'venue', 'status', 'score', 'one_line', 'stage', 'source_week', 'review', 'questions', 'tags', 'repro'] as const

// ---------- 极简 frontmatter（仅支持本插件 schema 所需子集） ----------

export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  if (!text.startsWith('---\n')) return { data: {}, body: text }
  const end = text.indexOf('\n---\n', 4)
  if (end < 0) return { data: {}, body: text }
  const fmText = text.slice(4, end)
  const body = text.slice(end + 5)
  const data: Record<string, unknown> = {}
  const lines = fmText.split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const m = /^([A-Za-z_][\w]*):(?:\s*(.*))?$/.exec(line)
    if (!m) { i++; continue }
    const key = m[1]!
    const rest = (m[2] ?? '').trim()
    if (rest !== '') {
      data[key] = parseScalar(rest)
      i++
    } else if (lines[i + 1]?.startsWith('  - ') || lines[i + 1]?.startsWith('- ')) {
      // 数组（标量列表或对象列表）
      const items: unknown[] = []
      i++
      while (i < lines.length && /^(\s*)- /.test(lines[i]!)) {
        const indent = lines[i]!.indexOf('- ')
        if (/^-\s+\S+\s*:/.test(lines[i]!.slice(indent + 2)) || /^ {2,}\S+\s*:/.test(lines[i + 1] ?? '')) {
          // 对象列表：- k: v / 续行缩进字段
          const obj: Record<string, unknown> = {}
          let first = lines[i]!.slice(indent + 2)
          const fm2 = /^([\w]+):\s*(.*)$/.exec(first)
          if (fm2) obj[fm2[1]!] = parseScalar(fm2[2]!)
          i++
          while (i < lines.length && /^\s{2,}[\w]+:/.test(lines[i]!)) {
            const cm = /^\s{2,}([\w]+):\s*(.*)$/.exec(lines[i]!)!
            obj[cm[1]!] = parseScalar(cm[2]!)
            i++
          }
          items.push(obj)
        } else {
          items.push(parseScalar(lines[i]!.slice(indent + 2).trim()))
          i++
        }
      }
      data[key] = items
    } else {
      data[key] = ''
      i++
    }
  }
  return { data, body }
}

function parseScalar(s: string): unknown {
  if (s === '[]') return []
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^-?\d+$/.test(s)) return Number(s)
  if (/^-?\d+\.\d+$/.test(s)) return Number(s)
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1)
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1)
  return s
}

function fmtScalar(v: unknown): string {
  if (typeof v === 'string') {
    // 含冒号/井号或形如数字的字符串必须加引号，否则 round-trip 会变类型（如 source: 3.2）
    if (v.includes(':') || v.includes('#') || /^-?\d+(\.\d+)?$/.test(v)) return JSON.stringify(v)
    return v
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return JSON.stringify(v)
}

export function serializeFrontmatter(data: Record<string, unknown>, body: string): string {
  const lines: string[] = ['---']
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      if (v.length === 0) { lines.push(`${k}: []`); continue }
      if (v.every(x => x !== null && typeof x === 'object')) {
        lines.push(`${k}:`)
        for (const item of v as Record<string, unknown>[]) {
          const entries = Object.entries(item)
          lines.push(`  - ${entries[0]![0]}: ${fmtScalar(entries[0]![1])}`)
          for (const [ik, iv] of entries.slice(1)) lines.push(`    ${ik}: ${fmtScalar(iv)}`)
        }
      } else {
        lines.push(`${k}:`)
        for (const item of v) lines.push(`  - ${fmtScalar(item)}`)
      }
    } else {
      lines.push(`${k}: ${v === undefined ? '' : fmtScalar(v)}`)
    }
  }
  lines.push('---', '')
  return lines.join('\n') + body
}

// ---------- 档案 ----------

function cardPath(root: string, arxiv: string): string { return join(root, 'cards', `${arxiv}.md`) }

function toCard(data: Record<string, unknown>, body: string): PaperCard {
  const str = (k: string, d = '') => (typeof data[k] === 'string' ? data[k] as string : d)
  // repro 存为单元素对象列表（frontmatter 解析器支持对象列表、不支持单值对象）
  const reproRaw = Array.isArray(data.repro) && data.repro[0] !== null && typeof data.repro[0] === 'object' ? data.repro[0] as Record<string, unknown> : {}
  return {
    arxiv: str('arxiv'), title: str('title'), authors: str('authors'), year: str('year'), venue: str('venue'),
    status: (str('status', 'later') as PaperCard['status']),
    score: Number(data.score ?? 0), one_line: str('one_line'),
    stage: Number(data.stage ?? 0), source_week: str('source_week'),
    review: Array.isArray(data.review) ? data.review as ReviewItem[] : [],
    questions: Array.isArray(data.questions) ? data.questions as string[] : [],
    tags: Array.isArray(data.tags) ? data.tags as string[] : ['paper'],
    repro: {
      env: reproRaw.env === true,
      code: reproRaw.code === true,
      results: reproRaw.results === true,
      note: typeof reproRaw.note === 'string' ? reproRaw.note : '',
    },
    body,
  }
}

/** 幂等建档/更新：按 arxiv 定位，传入字段覆盖 frontmatter，正文保留（checkpoint 用 writeCheckpoint 单独维护）。 */
export async function upsertCard(root: string, patch: Partial<PaperCard> & { arxiv: string }): Promise<PaperCard> {
  const arxiv = patch.arxiv
  assertArxivId(arxiv)
  const file = cardPath(root, arxiv)
  let data: Record<string, unknown> = {}
  let body = ''
  try {
    const parsed = parseFrontmatter(await readFile(file, 'utf8'))
    data = parsed.data; body = parsed.body
  } catch { /* 新建 */ }
  for (const field of CARD_FIELDS) {
    const v = (patch as Record<string, unknown>)[field]
    if (v !== undefined && field !== 'arxiv') {
      // repro 在 frontmatter 里存为单元素对象列表；patch 允许直接传对象
      data[field] = field === 'repro' && !Array.isArray(v) ? [v] : v
    }
  }
  if (data.arxiv === undefined || data.arxiv === '') data.arxiv = patch.arxiv
  if (!Array.isArray(data.tags) || (data.tags as string[]).length === 0) data.tags = ['paper']
  await mkdir(join(root, 'cards'), { recursive: true })
  await writeFile(file, serializeFrontmatter(data, body), 'utf8')
  return toCard(data, body)
}

export async function getCard(root: string, arxiv: string): Promise<PaperCard | undefined> {
  assertArxivId(arxiv)
  try {
    const parsed = parseFrontmatter(await readFile(cardPath(root, arxiv), 'utf8'))
    return toCard(parsed.data, parsed.body)
  } catch { return undefined }
}

export async function listCards(root: string): Promise<PaperCard[]> {
  return (await listMd(join(root, 'cards'))).map(f => parseFrontmatter(f.text))
    .map(p => toCard(p.data, p.body))
}

// ---------- 断点小节 ----------

export interface Checkpoint { at: string; pending?: string; review?: string }

/** 整段替换正文中的 `## 断点` 小节（无则追加到文末）。 */
export async function writeCheckpoint(root: string, arxiv: string, cp: Checkpoint): Promise<void> {
  assertArxivId(arxiv)
  const file = cardPath(root, arxiv)
  let data: Record<string, unknown> = {}
  let body = ''
  try { const p = parseFrontmatter(await readFile(file, 'utf8')); data = p.data; body = p.body } catch { data.arxiv = arxiv }
  const section = ['## 断点', '', `讲到：${cp.at}`, cp.pending ? `待回收问题：${cp.pending}` : '', cp.review ? `回炉点：${cp.review}` : '']
    .filter(x => x !== '').join('\n') + '\n'
  const re = /(^|\n)## 断点\n[\s\S]*?(?=\n## |\n?$)/
  body = re.test(body) ? body.replace(re, `\n${section}`) : `${body.replace(/\s*$/, '')}\n\n${section}`
  await writeFile(file, serializeFrontmatter(data, body), 'utf8')
}

export function readCheckpoint(card: PaperCard): Checkpoint | undefined {
  const m = /## 断点\n([\s\S]*?)(?=\n## |\n?$)/.exec(card.body)
  if (!m) return undefined
  const text = m[1]!
  const at = /讲到：(.*)/.exec(text)?.[1]
  if (!at) return undefined
  return { at, pending: /待回收问题：(.*)/.exec(text)?.[1], review: /回炉点：(.*)/.exec(text)?.[1] }
}

// ---------- 术语卡 ----------

function glossaryPath(root: string, slug: string): string { return join(root, 'glossary', `${slug}.md`) }

export async function upsertGlossary(root: string, term: GlossaryTerm): Promise<GlossaryTerm> {
  const file = glossaryPath(root, term.slug)
  let body = ''
  try { body = parseFrontmatter(await readFile(file, 'utf8')).body } catch {}
  const data: Record<string, unknown> = {
    zh: term.zh, en: term.en, plain: term.plain, first_seen: term.first_seen,
    related: term.related ?? [], tags: ['glossary'],
  }
  await mkdir(join(root, 'glossary'), { recursive: true })
  await writeFile(file, serializeFrontmatter(data, body), 'utf8')
  return term
}

export async function listGlossary(root: string): Promise<GlossaryTerm[]> {
  const out: GlossaryTerm[] = []
  for (const f of await listMd(join(root, 'glossary'))) {
    const d = parseFrontmatter(f.text).data
    out.push({
      slug: f.name.replace(/\.md$/, ''),
      zh: String(d.zh ?? ''), en: String(d.en ?? ''), plain: String(d.plain ?? ''),
      first_seen: String(d.first_seen ?? ''), related: Array.isArray(d.related) ? d.related as string[] : [],
    })
  }
  return out
}

// ---------- 周报 ----------

export async function writeReport(root: string, week: string, markdown: string): Promise<string> {
  await mkdir(join(root, 'reports'), { recursive: true })
  const file = join(root, 'reports', `${week}-arxiv.md`)
  await writeFile(file, markdown, 'utf8')
  return file
}

export async function listReports(root: string): Promise<ReportMeta[]> {
  const dir = join(root, 'reports')
  const names: string[] = []
  try { names.push(...(await readdir(dir)).filter(n => n.endsWith('-arxiv.md'))) } catch { return [] }
  const metas: ReportMeta[] = []
  for (const name of names) {
    const st = await stat(join(dir, name))
    metas.push({ week: name.replace('-arxiv.md', ''), path: join(dir, name), mtimeMs: st.mtimeMs })
  }
  return metas.sort((a, b) => b.week.localeCompare(a.week))
}

// ---------- 内部 ----------

async function listMd(dir: string): Promise<Array<{ name: string; text: string }>> {
  let names: string[] = []
  try { names = (await readdir(dir)).filter(n => n.endsWith('.md')) } catch { return [] }
  const out: Array<{ name: string; text: string }> = []
  for (const name of names) out.push({ name, text: await readFile(join(dir, name), 'utf8') })
  return out
}
