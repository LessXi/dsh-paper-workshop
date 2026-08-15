/** /workshop RPC 通道：面板只读数据出口。模式参照 dsh-polling/src/routes.ts。 */
import type { Context } from '@deepseek-ai/cordis'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
import { loadConfig, resolveDataRoot } from './config.ts'
import { getCard, listCards, listGlossary, listReports, readCheckpoint } from './store.ts'

export interface RpcDeps { homeDir: string; dataRootOverride?: string }

type Handler = (payload: unknown, signal: AbortSignal) => Promise<unknown>

async function rootOf(deps: RpcDeps): Promise<string> {
  return deps.dataRootOverride ?? resolveDataRoot(await loadConfig(deps.homeDir))
}

export function buildHandlers(deps: RpcDeps): Record<string, Handler> {
  const need = <T>(payload: unknown): T => payload as T
  return {
    'overview': async (_p, signal) => {
      signal.throwIfAborted()
      const root = await rootOf(deps)
      const [cards, glossary, reports] = await Promise.all([listCards(root), listGlossary(root), listReports(root)])
      return {
        dataRoot: root,
        cards: cards.map(c => ({ arxiv: c.arxiv, title: c.title, status: c.status, score: c.score, stage: c.stage, source_week: c.source_week })),
        counts: { total: cards.length, reading: cards.filter(c => c.status === 'reading').length, later: cards.filter(c => c.status === 'later').length, done: cards.filter(c => c.status === 'done').length },
        glossaryCount: glossary.length,
        reports: reports.map(r => ({ week: r.week, mtimeMs: r.mtimeMs })),
      }
    },
    'cards/list': async (_p, signal) => {
      signal.throwIfAborted()
      const cards = await listCards(await rootOf(deps))
      return { cards: cards.map(c => ({ arxiv: c.arxiv, title: c.title, status: c.status, score: c.score, stage: c.stage })) }
    },
    'cards/get': async (p, signal) => {
      signal.throwIfAborted()
      const { arxiv } = need<{ arxiv: string }>(p)
      const card = await getCard(await rootOf(deps), arxiv)
      if (card === undefined) throw new Error(`档案不存在：${arxiv}`)
      const { body, ...rest } = card
      return { card: rest, checkpoint: readCheckpoint(card), notesHint: `研读库 notes/${arxiv}/` }
    },
    'glossary/list': async (_p, signal) => {
      signal.throwIfAborted()
      return { terms: await listGlossary(await rootOf(deps)) }
    },
    'reports/list': async (_p, signal) => {
      signal.throwIfAborted()
      return { reports: await listReports(await rootOf(deps)) }
    },
  }
}

export function registerWorkshopRpc(ctx: Context, deps: RpcDeps): () => Promise<void> {
  type ConnectionRpc = { readonly rpc: { handle: (channel: string, fn: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>, opts?: { authority?: string }) => () => Promise<void> } }
  const connection = ctx.get('connection') as ConnectionRpc | undefined
  if (connection === undefined) return async () => {}
  const handlers = buildHandlers(deps)
  // RpcErrorCode 是闭合枚举（见 @deepseek-ai/dsh-host-apiproxy/api 的 RpcErrorCode），
  // 不包含 'rpc-not-found'；dsh-polling 只使用 'internal'。这里保留 brief 的 'rpc-not-found'
  // 字面量（运行时 wire 协议实际接受任意 code），用限定类型断言满足闭合联合。
  return connection.rpc.handle('/workshop', async (endpoint, payload, signal): Promise<RpcResult<unknown>> => {
    const handler = handlers[endpoint]
    if (handler === undefined) {
      return { ok: false, error: { code: 'rpc-not-found', message: `unknown workshop endpoint "${endpoint}"`, details: {} } } as unknown as { ok: false; error: { code: 'internal'; message: string; details: Record<string, never> } }
    }
    try { return { ok: true, value: await handler(payload, signal) } }
    catch (error: unknown) { return { ok: false, error: { code: 'internal', message: error instanceof Error ? error.message : String(error), details: {} } } }
  }, { authority: 'loopback' })
}
