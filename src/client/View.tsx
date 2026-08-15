/**
 * 论文工坊主视图（conversation.view 视图环成员，与「对话/轨迹/瀑布流」并列）。
 * 三个二级页签：论文库（左队列右详情 master-detail）/ 周报 / 术语表。
 * 视觉全部走 --dsw-* 设计令牌 + 官方原语（Button/Input），自动跟随明暗主题。
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

const SECTIONS = ['论文库', '周报', '术语表'] as const
type Section = (typeof SECTIONS)[number]

const STATUS_ZH: Record<string, string> = { later: '待读', reading: '在读', done: '已读', skipped: '跳过' }
const STAGE_ZH = ['筛选', '鸟瞰', '精读', '深挖', '溯源', '复现', '内化']

// ---- 样式（全部走 dsw 令牌，明暗主题自适应） ----
const T = {
  text: 'var(--dsw-alias-label-primary)',
  sub: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))',
  border: 'var(--dsw-alias-border-l1)',
  border2: 'var(--dsw-alias-border-l2)',
  bg: 'var(--dsw-alias-bg-base)',
  layer: 'var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base))',
  hover: 'var(--dsw-alias-interactive-bg-hover)',
  brand: 'var(--dsw-alias-brand-primary)',
  ok: 'var(--dsw-alias-state-success-primary)',
  warn: 'var(--dsw-alias-state-warn-primary)',
}

const chip = (color: string): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', padding: '1px 9px', borderRadius: 999,
  fontSize: 12, lineHeight: '18px', whiteSpace: 'nowrap',
  color, background: `color-mix(in srgb, ${color} 12%, transparent)`,
})

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

/** 复现清单（进入复现阶段或有进度时显示）。 */
function ReproList({ repro }: { repro: ReproState }) {
  const anyProgress = repro.env || repro.code || repro.results
  if (!anyProgress && repro.note === '') return null
  const items: Array<[boolean, string]> = [[repro.env, '环境搭好'], [repro.code, '代码跑通'], [repro.results, '结果对齐']]
  return (
    <div style={{ margin: '14px 0', padding: '12px 14px', border: `1px solid ${T.border}`, borderRadius: 10, background: T.layer }}>
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

/** 论文详情右栏。 */
function DetailPane({ detail }: { detail: CardDetail | null }) {
  if (detail === null) {
    return <div style={{ color: T.faint, fontSize: 13, padding: '18px 4px' }}>左侧点选一篇论文，这里显示研读进度与断点。</div>
  }
  const c = detail.card
  const stage = Number(c.stage ?? 0)
  const statusZh = STATUS_ZH[String(c.status)] ?? String(c.status)
  const tone = c.status === 'reading' ? T.brand : c.status === 'done' ? T.ok : T.sub
  return (
    <div style={{ fontSize: 13, lineHeight: 1.65 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 6, lineHeight: 1.5 }}>
        {String(c.title || c.arxiv)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
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
        <div style={{ margin: '14px 0', padding: '12px 14px', border: `1px solid ${T.border}`, borderRadius: 10, background: T.layer }}>
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
        marginTop: 14, padding: '10px 14px', borderRadius: 10,
        background: `color-mix(in srgb, ${T.brand} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${T.brand} 25%, transparent)`,
        color: T.text, fontSize: 12.5,
      }}>
        💡 在对话里说「继续 {String(c.arxiv)}」，从断点接着上课
      </div>
    </div>
  )
}

/** 主视图组件。 */
export function WorkshopView({ call }: WorkshopViewInjected & Partial<WorkshopViewOwnerProps>) {
  const [section, setSection] = useState<Section>('论文库')
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

  if (error !== '') return <div style={{ padding: 24, color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>加载失败：{error}</div>
  if (ov === null) return <div style={{ padding: 24, color: T.sub, fontSize: 13 }}>加载中…</div>

  return (
    <div style={{ padding: '20px 26px 32px', maxWidth: 1080, margin: '0 auto', fontSize: 13, lineHeight: 1.6, color: T.text }}>
      {/* 二级页签 + 刷新 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, borderBottom: `1px solid ${T.border2}`, marginBottom: 16 }}>
        {SECTIONS.map(s => (
          <button key={s} onClick={() => setSection(s)} style={{
            padding: '7px 2px 9px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13.5, color: section === s ? T.text : T.sub,
            fontWeight: section === s ? 600 : 400,
            borderBottom: `2px solid ${section === s ? T.brand : 'transparent'}`, marginBottom: -1,
          }}>{s}</button>
        ))}
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" icon={<IconRefreshOutline14 />} onClick={load}>刷新</Button>
      </div>

      {section === '论文库' && (
        <>
          <div style={{ fontSize: 12.5, color: T.sub, marginBottom: 12 }}>
            研读库 <span style={{ fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>{ov.dataRoot}</span>
            <span style={{ margin: '0 8px', color: T.border }}>·</span>
            共 <b>{ov.counts.total}</b> 篇
            <span style={{ margin: '0 8px', color: T.border }}>·</span>在读 <b>{ov.counts.reading}</b>
            <span style={{ margin: '0 8px', color: T.border }}>·</span>待读 <b>{ov.counts.later}</b>
            <span style={{ margin: '0 8px', color: T.border }}>·</span>已读 <b>{ov.counts.done}</b>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
            {/* 左：论文队列 */}
            <div style={{ flex: '5 1 320px', minWidth: 280 }}>
              {ov.cards.length === 0
                ? <div style={{ padding: '22px 4px', color: T.faint, fontSize: 13 }}>
                  还没有论文。在对话里说「研读这篇 &lt;arXiv 编号或链接&gt;」，或等每周一自动周报推荐。
                </div>
                : (
                  <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.layer, overflow: 'hidden' }}>
                    {ov.cards.map((c, i) => {
                      const active = c.arxiv === selected
                      return (
                        <div key={c.arxiv} onClick={() => setSelected(c.arxiv)} style={{
                          padding: '10px 14px', cursor: 'pointer',
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
                            <span style={{ fontSize: 11.5, color: T.faint, fontFamily: 'ui-monospace, Consolas, monospace' }}>{c.arxiv}</span>
                            <StageBar stage={c.stage} status={c.status} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
            </div>
            {/* 右：详情 */}
            <div style={{ flex: '4 1 280px', minWidth: 260, border: `1px solid ${T.border}`, borderRadius: 10, background: T.layer, padding: '14px 16px' }}>
              <DetailPane detail={detail} />
            </div>
          </div>
        </>
      )}

      {section === '周报' && (
        ov.reports.length === 0
          ? <div style={{ padding: '22px 4px', color: T.faint, fontSize: 13 }}>
            还没有周报。每周一自动生成，或在对话里说「跑一下周报」。
          </div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ov.reports.map(r => (
                <div key={r.week} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px',
                  border: `1px solid ${T.border}`, borderRadius: 10, background: T.layer,
                }}>
                  <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{r.week}</span>
                  <span style={{ flex: 1, color: T.sub, fontSize: 12.5 }}>{new Date(r.mtimeMs).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })} 生成</span>
                  <span style={{ fontSize: 12, color: T.faint }}>对话里说「看 {r.week} 周报」我来解读</span>
                </div>
              ))}
            </div>
          )
      )}

      {section === '术语表' && (
        <>
          <div style={{ marginBottom: 12, maxWidth: 320 }}>
            <Input icon={<IconSearchOutline16 />} placeholder="搜索中文 / 英文 / 解释" value={termQuery} onChange={(e: ChangeEvent<HTMLInputElement>) => setTermQuery(e.target.value)} />
          </div>
          {filteredTerms.length === 0
            ? <div style={{ padding: '22px 4px', color: T.faint, fontSize: 13 }}>
              {terms.length === 0 ? '还没有术语。精读时攒下的新词会自动进来。' : '没有匹配的术语。'}
            </div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>{['中文', '英文', '人话解释', '首见'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px', fontSize: 12, fontWeight: 500,
                      color: T.sub, borderBottom: `1px solid ${T.border2}`,
                    }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {filteredTerms.map(t => (
                    <tr key={t.slug}>
                      <td style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{t.zh}</td>
                      <td style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}`, color: T.sub, whiteSpace: 'nowrap' }}>{t.en}</td>
                      <td style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}` }}>{t.plain}</td>
                      <td style={{ padding: '9px 12px', borderBottom: `1px solid ${T.border}`, color: T.faint, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}>{t.first_seen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </>
      )}
    </div>
  )
}

export type { ReproState, CardRow, Overview, TermRow, CardDetail }
