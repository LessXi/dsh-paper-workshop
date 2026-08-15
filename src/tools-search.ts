/** 5 个免 key 检索工具：arXiv export API ×3 + Semantic Scholar ×2。execute 逻辑移植自 dsh-paper-workbench tools/*.json。 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ParameterSchemaSpec } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-session'

// ---------- execute 实现（与 workbench JSON 逐条对齐） ----------

async function arxivSearchExecute(args: { query: string; max_results?: number }): Promise<unknown> {
  const q = String(args.query || '').trim()
  const max = Math.min(parseInt(String(args.max_results ?? 5), 10) || 5, 20)
  if (!q) return { error: 'query 不能为空' }
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(q)}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`
  const res = await fetch(url)
  if (!res.ok) return { error: `arXiv API HTTP ${res.status}` }
  const xml = await res.text()
  const clean = (s: string | undefined) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const g = (e: string, re: RegExp) => { const m = e.match(re); return m ? clean(m[1]) : '' }
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => m[1]!)
  const items = entries.map(e => ({
    id: g(e, /<id>\s*https?:\/\/arxiv\.org\/abs\/([^<\s]+)/),
    title: g(e, /<title>([\s\S]*?)<\/title>/),
    summary: clean(g(e, /<summary>([\s\S]*?)<\/summary>/)).slice(0, 800),
    authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => clean(m[1]!)).slice(0, 20),
    published: (g(e, /<published>([^T\s]+)/) || '').slice(0, 10),
    categories: [...e.matchAll(/<category term="([^"]+)"/g)].map(m => m[1]!).slice(0, 6),
    link: g(e, /<link[^>]*href="(http[^"]+)"/),
  }))
  return { count: items.length, items }
}

async function arxivPaperExecute(args: { id: string }): Promise<unknown> {
  const id = String(args.id || '').trim()
  if (!id) return { error: 'id 不能为空' }
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`
  const res = await fetch(url)
  if (!res.ok) return { error: `arXiv API HTTP ${res.status}` }
  const xml = await res.text()
  const em = xml.match(/<entry>([\s\S]*?)(<entry>|<\/feed>)/)
  if (!em) return { error: '未找到该编号' }
  const e = em[1]!
  const clean = (s: string | undefined) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const g = (re: RegExp) => { const m = e.match(re); return m ? clean(m[1]!) : '' }
  return {
    arxiv: g(/\/abs\/([^<\s]+)/), title: g(/<title>([\s\S]*?)<\/title>/),
    summary: g(/<summary>([\s\S]*?)<\/summary>/),
    authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => clean(m[1]!)).slice(0, 30),
    published: (g(/<published>([^T\s]+)/) || '').slice(0, 10),
    updated: (g(/<updated>([^T\s]+)/) || '').slice(0, 10),
    doi: g(/<arxiv:doi>([\s\S]*?)<\/arxiv:doi>/),
    journal_ref: g(/<arxiv:journal_ref>([\s\S]*?)<\/arxiv:journal_ref>/),
    comment: g(/<arxiv:comment>([\s\S]*?)<\/arxiv:comment>/),
    categories: [...e.matchAll(/<category term="([^"]+)"/g)].map(m => m[1]!).slice(0, 8),
    link: `https://arxiv.org/abs/${id}`,
  }
}

async function arxivBibtexExecute(args: { id: string }): Promise<unknown> {
  const id = String(args.id || '').trim()
  if (!id) return { error: 'id 不能为空' }
  let p: { arxiv: string; title: string; authors: string[]; published: string } | null = null
  let lastErr = 'unknown'
  for (let attempt = 0; attempt < 2 && !p; attempt++) {
    try {
      const res = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const em = xml.match(/<entry>([\s\S]*?)(<entry>|<\/feed>)/)
      if (!em) throw new Error('not found')
      const e = em[1]!
      const clean = (s: string | undefined) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const g = (re: RegExp) => { const m = e.match(re); return m ? clean(m[1]!) : '' }
      p = { arxiv: g(/\/abs\/([^<\s]+)/).replace(/v\d+$/, ''), title: g(/<title>([\s\S]*?)<\/title>/), authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => clean(m[1]!)), published: (g(/<published>([^T\s]+)/) || '').slice(0, 4) }
    } catch (err) { lastErr = (err as Error).message; if (attempt === 0) await new Promise(r => setTimeout(r, 1500)) }
  }
  if (!p) return { error: lastErr }
  const first = (p.authors[0] ?? 'anon').split(/\s+/).filter(Boolean)[0] ?? 'anon'
  const key = `${first}${p.published}${p.arxiv.replace(/\D/g, '').slice(0, 3)}`
  const bibtex = ['@article{' + key + ',', `  author = {${p.authors.join(' and ')}},`, `  title = {${p.title}},`, `  journal = {arXiv preprint arXiv:${p.arxiv}},`, `  year = {${p.published}},`, '  archivePrefix = {arXiv},', `  eprint = {${p.arxiv}},`, `  url = {https://arxiv.org/abs/${p.arxiv}}`, '}'].join('\n')
  return { key, bibtex }
}

async function scholarExecute(kind: 'references' | 'citations', args: { id: string; limit?: number }): Promise<unknown> {
  const id = String(args.id || '').trim()
  const limit = Math.min(parseInt(String(args.limit ?? 10), 10) || 10, 50)
  if (!id) return { error: 'id 不能为空' }
  const paperId = /^\d{4}\.\d{4,5}(v\d+)?$/.test(id) ? `ARXIV:${id}` : id
  const call = () => fetch(`https://api.semanticscholar.org/graph/v1/paper/${paperId}/${kind}?limit=${limit}&fields=title,year,venue,externalIds`, { headers: { 'User-Agent': 'paper-workshop' } })
  let res = await call()
  if (res.status === 429) { await new Promise(r => setTimeout(r, 2600)); res = await call() }
  if (res.status === 429) return { error: 'Semantic Scholar 限流（429），稍后重试或改用 web_search' }
  if (!res.ok) return { error: `Semantic Scholar HTTP ${res.status}` }
  const j = await res.json() as { data?: Array<Record<string, unknown>> }
  if (!Array.isArray(j.data)) return { error: '未找到引文数据' }
  const pick = kind === 'references' ? 'citedPaper' : 'citingPaper'
  const items = j.data.map(d => {
    const p = (d?.[pick] ?? {}) as Record<string, unknown>
    return { title: String(p.title ?? ''), year: p.year ?? '', venue: String(p.venue ?? ''), arxiv: ((p.externalIds ?? {}) as Record<string, string>).ArXiv ?? '' }
  })
  return { count: items.length, paper: paperId, items }
}

// ---------- 工具注册（dsh-tools defineTool 模式，参照 dsh-polling/src/tools.ts） ----------

function textRender(_args: unknown, value: unknown) {
  return [{ type: 'text' as const, text: JSON.stringify(value) }]
}

/** 测试口：按名直跑 execute（不注册，绕开 cordis ctx）。 */
export async function runTool(name: string, args: Record<string, unknown>): Promise<any> {
  const impls: Record<string, (a: never) => Promise<unknown>> = {
    arxiv_search: arxivSearchExecute as never,
    arxiv_paper: arxivPaperExecute as never,
    arxiv_bibtex: arxivBibtexExecute as never,
    scholar_references: (a) => scholarExecute('references', a as never),
    scholar_citations: (a) => scholarExecute('citations', a as never),
  }
  const fn = impls[name]
  if (!fn) throw new Error(`unknown tool: ${name}`)
  return fn(args as never)
}

export function registerSearchTools(ctx: Context): () => void {
  const disposers: Array<() => void> = []
  const reg = (name: string, description: string, parameters: ParameterSchemaSpec, execute: (args: never) => Promise<Record<string, JsonValue>>) => {
    disposers.push(ctx.tools.register(defineTool({
      name, description, parameters,
      output: { schema: { type: 'object' as const, additionalProperties: true }, render: textRender },
      async execute(args, exec) {
        exec.signal.throwIfAborted()
        return execute(args as never)
      },
    })))
  }
  reg('arxiv_search', '按关键词/分类搜索 arXiv 论文（标题/摘要/作者/时间/分类/链接），免 key。研读阶段 0 筛选与每周周报用。', {
    query: { type: 'string', required: true, description: 'arXiv 搜索词，如 all:transformer、ti:robot、cat:cs.LG' },
    max_results: { type: 'integer', description: '返回条数 1-20，默认 5' },
  }, arxivSearchExecute as never)
  reg('arxiv_paper', '按 arXiv 编号取单篇论文完整元数据（标题/摘要/作者/DOI/分类），免 key。研读取原文信息用。', {
    id: { type: 'string', required: true, description: 'arXiv 编号，如 1805.12114 或 1805.12114v2' },
  }, arxivPaperExecute as never)
  reg('arxiv_bibtex', '按 arXiv 编号生成 BibTeX 引用条目，免 key。文献管理用。', {
    id: { type: 'string', required: true, description: 'arXiv 编号' },
  }, arxivBibtexExecute as never)
  reg('scholar_references', '查「这篇论文引用了谁」（向后溯源），Semantic Scholar 免费层，免 key，429 自动重试。研读阶段 4 溯源用。', {
    id: { type: 'string', required: true, description: 'arXiv 编号（自动加 ARXIV: 前缀）' },
    limit: { type: 'integer', description: '返回条数 1-50，默认 10' },
  }, ((a: { id: string; limit?: number }) => scholarExecute('references', a)) as never)
  reg('scholar_citations', '查「谁引用了这篇论文」（向前追踪后续进展），Semantic Scholar 免费层，免 key，429 自动重试。研读阶段 4 溯源用。', {
    id: { type: 'string', required: true, description: 'arXiv 编号（自动加 ARXIV: 前缀）' },
    limit: { type: 'integer', description: '返回条数 1-50，默认 10' },
  }, ((a: { id: string; limit?: number }) => scholarExecute('citations', a)) as never)
  return () => { for (const d of disposers.reverse()) d() }
}
