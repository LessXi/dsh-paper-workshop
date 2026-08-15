/**
 * 论文工坊主视图（conversation.view 视图环成员，与「对话/轨迹/瀑布流」并列）。
 * 单页三列并排：论文库 | 周报 | 术语表——三个板块同一页面同时可见，各自内容纵向流；
 * 窄窗口（<约 900px）自动上下堆叠。视觉全部走 --dsw-* 设计令牌，明暗主题自适应。
 * @module dsh-paper-workshop/client/View
 */

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties } from 'react'
import { Button, Input, IconRefreshOutline14, IconSearchOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

/** Props 注入给视图：指向 `/workshop` 通道的调用桥（已解包 RpcResult 信封）。 */
export interface WorkshopViewInjected {
  call: (endpoint: string, payload?: unknown) => Promise<unknown>
}

/** conversation.view 壳层 owner props（检视联动，本视图不消费，仅收编类型）。 */
export interface WorkshopViewOwnerProps {
  inspect?: { callId: string } | null
  onInspectDone?: () => void
}

interface ReproState { env: boolean; code: boolean; results: boolean; note: string }
interface CardRow {
  arxiv: string; title: string; status: string; score: number; stage: number
  repro?: ReproState
}
interface Overview {
  dataRoot: string
  cards: CardRow[]
  counts: { total: number; reading: number; later: number; done: number }
  glossaryCount: number
  reports: Array<{ week: string; mtimeMs: number }>
}
interface TermRow { slug: string; zh: string; en: string; plain: string; first_seen: string }
interface CardDetail {
  card: CardRow & Record<string, unknown>
  checkpoint?: { at?: string; pending?: string; review?: string }
}

const STATUS_ZH: Record<string, string> = { later: '待读', reading: '在读', done: '已读', skipped: '跳过' }
const STAGE_ZH = ['筛选', '鸟瞰', '精读', '深挖', '溯源', '复现', '内化']

// ---- 样式（全部走 dsw 令牌，明暗主题自适应） ----
const T = {
  text: 'var(--dsw-alias-label-primary)',
  sub: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))',
  border: 'var(--dsw-alias-border-l1)',
  border2: 'var(--dsw-alias-border-l2)',
  brand: 'var(--dsw-alias-brand-primary)',
  ok: 'var(--dsw-alias-state-success-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
  err: 'var(--dsw-alias-label-error, var(--dsw-alias-state-error-primary))',
}

const chip = (color: string): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '1px 9px', borderRadius: 999,
  fontSize: 12, lineHeight: '18px', whiteSpace: 'nowrap',
  color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
})

/** 三列中的每一列：圆角容器 + 标题条（标题 + 计数）+ 内容区。 */
function Column({ title, extra, flex, min, children }: {
  title: string; extra?: string; flex: string; min: number; children: React.ReactNode
}) {
  return (
    <div style={{ flex, minWidth: min, maxWidth: '100%', border: `1px solid ${T.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignSelf: 'stretch' }}>
      <div style={{ padding: '10px 14px 8px', display: 'flex', alignItems: 'baseline', gap: 8, borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{title}</span>
        {extra !== undefined && <span style={{ fontSize: 12, color: T.faint }}>{extra}</span>}
      </div>
      <div style={{ padding: '10px 14px 12px', minHeight: 0 }}>{children}</div>
    </div>
  )
}

/** 阶段 7 格进度条 + 文字标注。 */
function StageBar({ stage, status }: { stage: number; status: string }) {
  const done = status === 'done' ? 7 : Math.max(0, Math.min(7, stage))
  const label = done === 0 ? (status === 'skipped' ? '—' : '未开始')
    : done >= 7 ? '7/7 内化'
      : `${done}/7 ${STAGE_ZH[done - 1]}`
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} style={{
            width: 12, height: 4, borderRadius: 2,
            background: i < done ? T.brand : T.border,
          }} />
        ))}
      </span>
      <small style={{ fontSize: 12, color: T.sub, whiteSpace: 'nowrap' }}>{label}</small>
    </span>
  )
}

/** 复现清单（有进度或有备注时显示）。 */
function ReproList({ repro }: { repro: ReproState }) {
  const anyProgress = repro.env || repro.code || repro.results
  if (!anyProgress && repro.note === '') return null
  const items: Array<[boolean, string]> = [[repro.env, '环境搭好'], [repro.code, '代码跑通'], [repro.results, '结果对齐']]
  return (
    <div style={{ margin: '12px 0', padding: '10px 12px', border: `1px solid ${T.border}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, color: T.sub, marginBottom: 8, fontWeight: 500 }}>复现清单</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {items.map(([ok, label]) => (
          <span key={label} style={chip(ok ? T.ok : T.sub)}>{ok ? '✓' : '○'} {label}</span>
        ))}
      </div>
      {repro.note !== '' && <div style={{ fontSize: 12.5, color: T.sub, marginTop: 8, lineHeight: 1.6 }}>{repro.note}</div>}
      <div style={{ fontSize: 12, color: T.faint, marginTop: 8 }}>对话里说「环境好了 / 代码跑通了 / 结果对上了」即可更新</div>
    </div>
  )
}

/** 论文详情（论文库列内，选中后显示在队列表下方）。 */
function DetailPane({ detail }: { detail: CardDetail | null }) {
  if (detail === null) {
    return <div style={{ color: T.faint, fontSize: 12.5, padding: '4px 2px' }}>点选上方论文，这里显示研读进度与断点。</div>
  }
  const c = detail.card
  const stage = Number(c.stage ?? 0)
  const statusZh = STATUS_ZH[String(c.status)] ?? String(c.status)
  const tone = c.status === 'reading' ? T.brand : c.status === 'done' ? T.ok : T.sub
  return (
    <div style={{ fontSize: 13, lineHeight: 1.65 }}>
      <div style={{ fontSize: 14.5, fontWeight: 600, color: T.text, marginBottom: 6, lineHeight: 1.5 }}>
        {String(c.title || c.arxiv)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={chip(tone)}>{statusZh}</span>
        <span style={chip(Number(c.score) >= 7 ? T.brand : T.sub)}>{String(c.score)} 分</span>
        <a href={`https://arxiv.org/abs/${String(c.arxiv)}`} target="_blank" rel="noreferrer"
          style={{ fontSize: 12, color: T.brand, fontFamily: 'ui-monospace, Consolas, monospace' }}>
          arXiv:{String(c.arxiv)}
        </a>
      </div>
      <StageBar stage={stage} status={String(c.status)} />
      {c.repro !== undefined && <ReproList repro={c.repro} />}
      {detail.checkpoint !== undefined && (
        <div style={{ margin: '12px 0', padding: '10px 12px', border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, color: T.sub, marginBottom: 8, fontWeight: 500 }}>断点（下次从这接着讲）</div>
          <div style={{ color: T.text }}>讲到：{detail.checkpoint.at ?? '—'}</div>
          {detail.checkpoint.pending !== undefined && detail.checkpoint.pending !== '' && (
            <div style={{ color: T.sub, marginTop: 4 }}>待回收问题：{detail.checkpoint.pending}</div>
          )}
          {detail.checkpoint.review !== undefined && detail.checkpoint.review !== '' && (
            <div style={{ color: T.warn, marginTop: 4 }}>回炉点：{detail.checkpoint.review}</div>
          )}
        </div>
      )}
      <div style={{
        marginTop: 12, padding: '9px 12px', borderRadius: 10,
        background: `color-mix(in srgb, ${T.brand} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${T.brand} 25%, transparent)`,
        color: T.text, fontSize: 12.5,
      }}>
        💡 在对话里说「继续 {String(c.arxiv)}」，从断点接着上课
      </div>
    </div>
  )
}

/** 术语条目（紧凑纵排，适配窄列）。 */
function TermItem({ t }: { t: TermRow }) {
  return (
    <div style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: T.text }}>{t.zh}</span>
        <span style={{ color: T.sub, fontSize: 12 }}>{t.en}</span>
      </div>
      <div style={{ color: T.text, fontSize: 12.5, marginTop: 2, lineHeight: 1.55 }}>{t.plain}</div>
      <div style={{ color: T.faint, fontSize: 11.5, fontFamily: 'ui-monospace, Consolas, monospace', marginTop: 2 }}>首见 {t.first_seen}</div>
    </div>
  )
}

/** 主视图组件。 */
export function WorkshopView({ call }: WorkshopViewInjected & Partial<WorkshopViewOwnerProps>) {
  const [ov, setOv] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<CardDetail | null>(null)
  const [terms, setTerms] = useState<TermRow[]>([])
  const [termQuery, setTermQuery] = useState('')

  const load = useCallback(() => {
    call('overview').then(r => setOv(r as Overview)).catch(e => setError(String(e)))
    call('glossary/list').then(r => setTerms((r as { terms: TermRow[] }).terms)).catch(() => {})
  }, [call])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (selected === null) { setDetail(null); return }
    setDetail(null)
    call('cards/get', { arxiv: selected }).then(r => setDetail(r as CardDetail)).catch(e => setError(String(e)))
  }, [selected, call])

  const filteredTerms = useMemo(() => {
    const q = termQuery.trim().toLowerCase()
    if (q === '') return terms
    return terms.filter(t =>
      t.zh.toLowerCase().includes(q) || t.en.toLowerCase().includes(q)
      || t.plain.toLowerCase().includes(q) || t.first_seen.toLowerCase().includes(q))
  }, [terms, termQuery])

  if (error !== '') return <div style={{ padding: 24, color: T.err, fontSize: 13 }}>加载失败：{error}</div>
  if (ov === null) return <div style={{ padding: 24, color: T.sub, fontSize: 13 }}>加载中…</div>

  return (
    <div style={{ padding: '18px 26px 40px', maxWidth: 1280, margin: '0 auto', fontSize: 13, lineHeight: 1.6, color: T.text }}>
      {/* 头部：研读库 + 统计 + 刷新 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 12.5, color: T.sub }}>
          研读库 <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>{ov.dataRoot}</span>
          <span style={{ margin: '0 8px', color: T.border }}>·</span>
          共 <b>{ov.counts.total}</b> 篇
          <span style={{ margin: '0 8px', color: T.border }}>·</span>在读 <b>{ov.counts.reading}</b>
          <span style={{ margin: '0 8px', color: T.border }}>·</span>待读 <b>{ov.counts.later}</b>
          <span style={{ margin: '0 8px', color: T.border }}>·</span>已读 <b>{ov.counts.done}</b>
        </span>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon={<IconRefreshOutline14 />} onClick={load}>刷新</Button>
      </div>

      {/* 三列并排：论文库 | 周报 | 术语表（窄窗口自动堆叠） */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>

        {/* 列一：论文库（队列 + 选中详情） */}
        <Column title="论文库" extra={ov.cards.length > 0 ? `${ov.cards.length} 篇` : undefined} flex="5 1 340px" min={300}>
          {ov.cards.length === 0
            ? <div style={{ padding: '10px 2px', color: T.faint, fontSize: 12.5 }}>
              还没有论文。在对话里说「研读这篇 &lt;arXiv 编号或链接&gt;」，或等每周一自动周报推荐。
            </div>
            : (
              <div>
                {ov.cards.map((c, i) => {
                  const active = c.arxiv === selected
                  return (
                    <div key={c.arxiv} onClick={() => setSelected(c.arxiv)} style={{
                      padding: '8px 4px', cursor: 'pointer', borderRadius: 8,
                      borderTop: i === 0 ? 'none' : `1px solid ${T.border}`,
                      background: active ? `color-mix(in srgb, ${T.brand} 8%, transparent)` : undefined,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontWeight: active ? 600 : 400, color: T.text,
                        }}>{c.title || c.arxiv}</span>
                        <span style={chip(c.status === 'reading' ? T.brand : c.status === 'done' ? T.ok : T.sub)}>
                          {STATUS_ZH[c.status] ?? c.status}
                        </span>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: Number(c.score) >= 7 ? T.brand : T.sub, fontVariantNumeric: 'tabular-nums' }}>{c.score}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <span style={{ fontSize: 11.5, color: T.faint, fontFamily: 'ui-monospace, Consolas, monospace' }}>{c.arxiv}</span>
                        <StageBar stage={c.stage} status={c.status} />
                      </div>
                    </div>
                  )
                })}
                {selected !== null && (
                  <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 8, paddingTop: 10 }}>
                    {detail === null
                      ? <div style={{ color: T.faint, fontSize: 12.5 }}>详情加载中…</div>
                      : <DetailPane detail={detail} />}
                  </div>
                )}
              </div>
            )}
        </Column>

        {/* 列二：周报 */}
        <Column title="周报" extra={ov.reports.length > 0 ? `${ov.reports.length} 期` : undefined} flex="2 1 190px" min={180}>
          {ov.reports.length === 0
            ? <div style={{ padding: '10px 2px', color: T.faint, fontSize: 12.5 }}>
              还没有周报。每周一自动生成，或在对话里说「跑一下周报」。
            </div>
            : (
              <div>
                {ov.reports.map(r => (
                  <div key={r.week} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: T.text }}>{r.week}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12, color: T.sub }}>{new Date(r.mtimeMs).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.faint, marginTop: 2 }}>对话里说「看 {r.week} 周报」我来解读</div>
                  </div>
                ))}
              </div>
            )}
        </Column>

        {/* 列三：术语表 */}
        <Column title="术语表" extra={terms.length > 0 ? `${terms.length} 条` : undefined} flex="3 1 250px" min={240}>
          <div style={{ marginBottom: 6 }}>
            <Input icon={<IconSearchOutline16 />} placeholder="搜索中文 / 英文 / 解释" value={termQuery} onChange={(e: ChangeEvent<HTMLInputElement>) => setTermQuery(e.target.value)} />
          </div>
          {filteredTerms.length === 0
            ? <div style={{ padding: '10px 2px', color: T.faint, fontSize: 12.5 }}>
              {terms.length === 0 ? '还没有术语。精读时攒下的新词会自动进来。' : '没有匹配的术语。'}
            </div>
            : (
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {filteredTerms.map(t => <TermItem key={t.slug} t={t} />)}
              </div>
            )}
        </Column>

      </div>
    </div>
  )
}

export type { ReproState, CardRow, Overview, TermRow, CardDetail }
