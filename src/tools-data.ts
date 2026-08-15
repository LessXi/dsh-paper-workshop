/** 数据工具：skill 通过它们读写档案/术语/配置/概览（路径解析内聚，AI 不碰文件路径）。 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { loadConfig, resolveDataRoot, saveConfig, type WorkshopConfig } from './config.ts'
import { getCard, listCards, listGlossary, listReports, readCheckpoint, upsertCard, upsertGlossary, writeCheckpoint, type Checkpoint, type GlossaryTerm, type PaperCard } from './store.ts'

export interface DataToolDeps { homeDir: string; dataRootOverride?: string }

async function dataRootOf(deps: DataToolDeps): Promise<string> {
  if (deps.dataRootOverride !== undefined) return deps.dataRootOverride
  return resolveDataRoot(await loadConfig(deps.homeDir))
}

async function paperCardExecute(args: { action: 'get' | 'upsert' | 'list' | 'checkpoint'; arxiv?: string; card?: Partial<PaperCard>; at?: string; pending?: string; review?: string }, deps: DataToolDeps): Promise<unknown> {
  const root = await dataRootOf(deps)
  switch (args.action) {
    case 'upsert': {
      if (!args.card?.arxiv) return { error: 'card.arxiv 必填' }
      const card = await upsertCard(root, args.card as unknown as Partial<PaperCard> & { arxiv: string }) // arxiv 已在上行判非空
      return { card }
    }
    case 'get': {
      if (!args.arxiv) return { error: 'arxiv 必填' }
      const card = await getCard(root, args.arxiv)
      if (!card) return { error: `档案不存在：${args.arxiv}` }
      return { card, checkpoint: readCheckpoint(card) }
    }
    case 'list': {
      const cards = await listCards(root)
      return { cards: cards.map(({ body, ...rest }) => rest) } // 列表不带正文，省 token
    }
    case 'checkpoint': {
      if (!args.arxiv) return { error: 'arxiv 必填' }
      const cp: Checkpoint = { at: args.at ?? '', pending: args.pending, review: args.review }
      await writeCheckpoint(root, args.arxiv, cp)
      return { ok: true }
    }
  }
}

async function glossaryExecute(args: { action: 'upsert' | 'list'; term?: GlossaryTerm; slug?: string }, deps: DataToolDeps): Promise<unknown> {
  const root = await dataRootOf(deps)
  if (args.action === 'upsert') {
    if (!args.term?.slug) return { error: 'term.slug 必填' }
    return { term: await upsertGlossary(root, args.term) }
  }
  return { terms: await listGlossary(root) }
}

async function configExecute(args: { action: 'get' | 'set'; patch?: Record<string, unknown> }, deps: DataToolDeps): Promise<unknown> {
  if (args.action === 'set') {
    const current = await loadConfig(deps.homeDir)
    const merged = deepPatch(current, args.patch ?? {})
    await saveConfig(deps.homeDir, merged)
    return { config: merged, note: '配置已更新；周报调度将按新配置重载（下次触发生效）' }
  }
  return { config: await loadConfig(deps.homeDir) }
}

function deepPatch<T>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v !== null && typeof v === 'object' && !Array.isArray(v) ? deepPatch(out[k], v as Record<string, unknown>) : v
  }
  return out as T
}

async function overviewExecute(_args: Record<string, never>, deps: DataToolDeps): Promise<unknown> {
  const root = await dataRootOf(deps)
  const [cards, glossary, reports] = await Promise.all([listCards(root), listGlossary(root), listReports(root)])
  return {
    dataRoot: root,
    cards: cards.map(({ body, ...rest }) => rest),
    counts: { total: cards.length, reading: cards.filter(c => c.status === 'reading').length, later: cards.filter(c => c.status === 'later').length, done: cards.filter(c => c.status === 'done').length },
    glossary,
    glossaryCount: glossary.length,
    reports: reports.map(r => ({ week: r.week, mtimeMs: r.mtimeMs })),
  }
}

/** 测试口：按名直跑 execute。 */
export async function runDataTool(name: 'paper_card' | 'glossary' | 'workshop_config' | 'workshop_overview', args: Record<string, unknown>, deps: DataToolDeps): Promise<any> {
  switch (name) {
    case 'paper_card': return paperCardExecute(args as never, deps)
    case 'glossary': return glossaryExecute(args as never, deps)
    case 'workshop_config': return configExecute(args as never, deps)
    case 'workshop_overview': return overviewExecute(args as never, deps)
  }
}

function textRender(_args: unknown, value: unknown): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

export function registerDataTools(ctx: Context, deps: DataToolDeps): () => void {
  const disposers: Array<() => void> = []
  disposers.push(ctx.tools.register(defineTool({
    name: 'paper_card',
    description: '论文档案读写（研读库核心）：action=get 读单篇（含断点）/ upsert 幂等建档更新（传要改的字段）/ list 列全部 / checkpoint 写断点（at=讲到哪，pending=待回收问题，review=回炉点）。研读全程用它在档案里记进度。',
    parameters: {
      action: { type: 'string', required: true, description: 'get | upsert | list | checkpoint' },
      arxiv: { type: 'string', description: 'arXiv 编号（get/checkpoint 必填）' },
      card: { type: 'object', additionalProperties: true, description: 'upsert 时的档案字段（arxiv 必填；可含 status/score/stage/one_line/source_week/questions 等）' },
      at: { type: 'string', description: 'checkpoint：讲到哪个站点哪个概念' },
      pending: { type: 'string', description: 'checkpoint：待回收的检查问题' },
      review: { type: 'string', description: 'checkpoint：回炉点记录' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_a, value) => textRender(_a, value),
    },
    async execute(args, exec) { exec.signal.throwIfAborted(); return paperCardExecute(args as never, deps) as Promise<never> },
  })))
  disposers.push(ctx.tools.register(defineTool({
    name: 'glossary',
    description: '术语表读写：action=upsert 建/更术语卡（slug/zh/en/plain/first_seen/related）/ list 列全部。精读攒新词、溯源做术语卡时用。',
    parameters: {
      action: { type: 'string', required: true, description: 'upsert | list' },
      term: { type: 'object', additionalProperties: true, description: 'upsert 时的术语卡字段（slug 必填）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_a, value) => textRender(_a, value),
    },
    async execute(args, exec) { exec.signal.throwIfAborted(); return glossaryExecute(args as never, deps) as Promise<never> },
  })))
  disposers.push(ctx.tools.register(defineTool({
    name: 'workshop_config',
    description: '研读工作台配置读写：action=get 读 / set 改（patch 传要改的字段，如 storage.mode、weekly.cardThreshold）。用户说「研读设置」时用。',
    parameters: {
      action: { type: 'string', required: true, description: 'get | set' },
      patch: { type: 'object', additionalProperties: true, description: 'set 时的配置补丁（结构同 get 返回的 config）' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_a, value) => textRender(_a, value),
    },
    async execute(args, exec) { exec.signal.throwIfAborted(); return configExecute(args as never, deps) as Promise<never> },
  })))
  disposers.push(ctx.tools.register(defineTool({
    name: 'workshop_overview',
    description: '研读工作台总览：卡片队列（不带正文）+ 状态统计 + 术语数 + 周报列表。「我今天读什么」「工坊状态」时用。',
    parameters: {},
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_a, value) => textRender(_a, value),
    },
    async execute(args, exec) { exec.signal.throwIfAborted(); return overviewExecute(args as never, deps) as Promise<never> },
  })))
  return () => { for (const d of disposers.reverse()) d() }
}
