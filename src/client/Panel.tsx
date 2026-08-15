/**
 * 论文研读工坊面板：Settings → Plugins →「插件配置」tab 下的只读卡片。
 * 4 个视图：卡片队列 / 论文详情 / 周报 / 术语表。所有数据经注入的 `call`
 * 桥（host `/workshop` RPC 通道）读取，无写操作。
 * @module dsh-paper-workshop/client/Panel
 */

import { useEffect, useState } from 'react'

/** Props 注入给面板：指向 `/workshop` 通道的只读调用桥（已解包 RpcResult 信封）。 */
export interface WorkshopPanelInjected {
  call: (endpoint: string, payload?: unknown) => Promise<unknown>
}

interface CardRow { arxiv: string; title: string; status: string; score: number; stage: number }
interface Overview {
  dataRoot: string
  cards: CardRow[]
  counts: { total: number; reading: number; later: number; done: number }
  glossaryCount: number
  reports: Array<{ week: string; mtimeMs: number }>
}
interface TermRow { slug: string; zh: string; en: string; plain: string; first_seen: string }

const TABS = ['卡片队列', '论文详情', '周报', '术语表'] as const

export function WorkshopPanel({ call }: WorkshopPanelInjected) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('卡片队列')
  const [ov, setOv] = useState<Overview | null>(null)
  const [terms, setTerms] = useState<TermRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ card: CardRow & Record<string, unknown>; checkpoint?: { at?: string; pending?: string; review?: string } } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    call('overview').then(r => setOv(r as Overview)).catch(e => setError(String(e)))
    call('glossary/list').then(r => setTerms((r as { terms: TermRow[] }).terms)).catch(() => {})
  }, [call])

  useEffect(() => {
    if (tab === '论文详情' && selected !== null && detail === null) {
      call('cards/get', { arxiv: selected }).then(r => setDetail(r as never)).catch(e => setError(String(e)))
    }
  }, [tab, selected, detail, call])

  if (error !== '') return <div>加载失败：{error}</div>
  if (ov === null) return <div>加载中…</div>

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setDetail(null) }} style={{ padding: '4px 12px', cursor: 'pointer', opacity: tab === t ? 1 : 0.55 }}>{t}</button>
        ))}
      </div>
      {tab === '卡片队列' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['论文', '状态', '分', '阶段'].map(h => <th key={h} style={{ textAlign: 'left', padding: 4, borderBottom: '1px solid var(--border, #444)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {ov.cards.map(c => (
              <tr key={c.arxiv} style={{ cursor: 'pointer' }} onClick={() => { setSelected(c.arxiv); setTab('论文详情') }}>
                <td style={{ padding: 4 }}>{c.title || c.arxiv}</td>
                <td style={{ padding: 4 }}>{c.status}</td>
                <td style={{ padding: 4 }}>{c.score}</td>
                <td style={{ padding: 4 }}>{c.stage}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === '论文详情' && (selected === null
        ? <div>先在「卡片队列」点选一篇论文。</div>
        : detail === null ? <div>加载中…</div>
        : (
          <dl style={{ fontSize: 13, lineHeight: 1.8 }}>
            <dt><b>{String(detail.card.title || detail.card.arxiv)}</b></dt>
            <dd>阶段：{String(detail.card.stage)} · 状态：{String(detail.card.status)} · 分：{String(detail.card.score)}</dd>
            {detail.checkpoint && <dd>断点：{detail.checkpoint.at ?? '—'}</dd>}
            {detail.checkpoint?.pending && <dd>待回收问题：{detail.checkpoint.pending}</dd>}
            {detail.checkpoint?.review && <dd>回炉点：{detail.checkpoint.review}</dd>}
            <dd style={{ opacity: 0.7 }}>接续：对话里说「继续 {String(detail.card.arxiv)}」</dd>
          </dl>
        ))}
      {tab === '周报' && (
        <ul style={{ fontSize: 13, lineHeight: 1.8 }}>
          {ov.reports.map(r => <li key={r.week}>{r.week} 周报（{new Date(r.mtimeMs).toLocaleDateString()}）</li>)}
          {ov.reports.length === 0 && <li>还没有周报。等每周一自动生成，或对话里说「跑一下周报」。</li>}
        </ul>
      )}
      {tab === '术语表' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['中文', '英文', '人话解释', '首见'].map(h => <th key={h} style={{ textAlign: 'left', padding: 4, borderBottom: '1px solid var(--border, #444)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {terms.map(t => (
              <tr key={t.slug}>
                <td style={{ padding: 4 }}>{t.zh}</td>
                <td style={{ padding: 4 }}>{t.en}</td>
                <td style={{ padding: 4 }}>{t.plain}</td>
                <td style={{ padding: 4 }}>{t.first_seen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
