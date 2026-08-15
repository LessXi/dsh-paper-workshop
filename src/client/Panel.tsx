/**
 * 论文研读工坊面板：设置面板左侧独立导航页「论文工坊」（v0.3.0 起与
 * 「Agent 预设」平级，不再塞在「插件配置」页的卡片里）。
 * 论文队列/论文详情/周报/术语表 4 视图只读 + 设置视图（配置读写）。只读数据经注入的 `call`
 * 桥（host `/workshop` RPC 通道）读取，配置读写走 config/get · config/set，改动即时生效。
 * @module dsh-paper-workshop/client/Panel
 */

import { useEffect, useState, type CSSProperties } from 'react'

/** Props 注入给面板：指向 `/workshop` 通道的只读调用桥（已解包 RpcResult 信封）。 */
export interface WorkshopPanelInjected {
  call: (endpoint: string, payload?: unknown) => Promise<unknown>
}

/** settings.section 壳层注入的 owner props（关闭设置面板；面板暂不使用）。 */
export interface WorkshopPanelOwnerProps {
  close: () => void
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

/** workshop_config（config/get 返回值）形状。 */
interface ConfigState {
  storage: { mode: 'self' | 'obsidian'; selfPath: string; obsidianPath: string }
  weekly: {
    enabled: boolean; cron: string; timeZone: string
    categories: string[]; maxPerCategory: number; cardThreshold: number
  }
  pythonCmd: string
}

const TABS = ['论文队列', '论文详情', '周报', '术语表', '设置'] as const

/** 档案状态英文值 → 面板中文显示。 */
const STATUS_ZH: Record<string, string> = { later: '待读', reading: '在读', done: '已读', skipped: '跳过' }
/** 阶段号 → 中文名（0-6）。 */
const STAGE_ZH = ['筛选', '鸟瞰', '精读', '深挖', '溯源', '复现', '内化']

export function WorkshopPanel({ call }: WorkshopPanelInjected & Partial<WorkshopPanelOwnerProps>) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('论文队列')
  const [ov, setOv] = useState<Overview | null>(null)
  const [terms, setTerms] = useState<TermRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ card: CardRow & Record<string, unknown>; checkpoint?: { at?: string; pending?: string; review?: string } } | null>(null)
  const [error, setError] = useState('')
  // 设置页表单
  const [config, setConfig] = useState<ConfigState | null>(null)
  const [cfgSaving, setCfgSaving] = useState(false)
  const [cfgMsg, setCfgMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    call('overview').then(r => setOv(r as Overview)).catch(e => setError(String(e)))
    call('glossary/list').then(r => setTerms((r as { terms: TermRow[] }).terms)).catch(() => {})
  }, [call])

  useEffect(() => {
    if (tab === '论文详情' && selected !== null && detail === null) {
      call('cards/get', { arxiv: selected }).then(r => setDetail(r as never)).catch(e => setError(String(e)))
    }
    if (tab === '设置' && config === null) {
      call('config/get').then(r => { setConfig((r as { config: ConfigState }).config); setCfgMsg(null) }).catch(e => setCfgMsg({ ok: false, text: String(e) }))
    }
  }, [tab, selected, detail, config, call])

  if (error !== '') return <div>加载失败：{error}</div>
  if (ov === null) return <div>加载中…</div>

  /** 设置页保存：本地轻校验通过后调 config/set，成功刷新本地 state。 */
  const saveConfig = async (cfg: ConfigState) => {
    const validation: string[] = []
    if (cfg.storage.mode === 'obsidian' && cfg.storage.obsidianPath.trim() === '') validation.push('Obsidian 模式需要配置 vault 根目录（obsidianPath）')
    if (cfg.weekly.cron.trim().split(/\s+/).length !== 5) validation.push('cron 需为 5 段：分 时 日 月 周')
    if (!Number.isFinite(cfg.weekly.maxPerCategory) || cfg.weekly.maxPerCategory < 1) validation.push('每类条数需 ≥ 1')
    if (!Number.isFinite(cfg.weekly.cardThreshold) || cfg.weekly.cardThreshold < 1) validation.push('建档分数线需 ≥ 1')
    if (validation.length > 0) { setCfgMsg({ ok: false, text: validation.join('；') }); return }
    setCfgSaving(true)
    setCfgMsg(null)
    try {
      const res = await call('config/set', {
        patch: {
          storage: { mode: cfg.storage.mode, selfPath: cfg.storage.selfPath, obsidianPath: cfg.storage.obsidianPath },
          weekly: {
            enabled: cfg.weekly.enabled, cron: cfg.weekly.cron, timeZone: cfg.weekly.timeZone,
            categories: cfg.weekly.categories.join(',').split(/[,，]/).map(s => s.trim()).filter(Boolean),
            maxPerCategory: Number(cfg.weekly.maxPerCategory), cardThreshold: Number(cfg.weekly.cardThreshold),
          },
          pythonCmd: cfg.pythonCmd,
        },
      })
      setConfig((res as { config: ConfigState }).config)
      setCfgMsg({ ok: true, text: '✓ 已保存并即时生效' })
    } catch (e) {
      setCfgMsg({ ok: false, text: String(e) })
    } finally {
      setCfgSaving(false)
    }
  }

  return (
    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
      <div style={{ display: 'flex', gap: 18, marginBottom: 14, borderBottom: '1px solid var(--border, #444)' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setDetail(null) }}
            style={{
              padding: '6px 2px', cursor: 'pointer', background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--accent, #4a9eff)' : 'transparent'}`,
              color: tab === t ? 'inherit' : 'var(--text-secondary, #999)',
              fontWeight: tab === t ? 600 : 400, marginBottom: -1,
            }}
          >{t}</button>
        ))}
      </div>
      {tab === '论文队列' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr>{['论文', '状态', '分', '阶段'].map(h => <th key={h} style={{ textAlign: 'left', padding: 4, borderBottom: '1px solid var(--border, #444)' }}>{h}</th>)}</tr></thead>
          <tbody>
            {ov.cards.map(c => (
              <tr key={c.arxiv} style={{ cursor: 'pointer' }} onClick={() => { setSelected(c.arxiv); setTab('论文详情'); setDetail(null) }}>
                <td style={{ padding: 4 }}>{c.title || c.arxiv}</td>
                <td style={{ padding: 4 }}>{STATUS_ZH[c.status] ?? c.status}</td>
                <td style={{ padding: 4 }}>{c.score}</td>
                <td style={{ padding: 4 }}>{c.stage >= 1 && c.stage <= 6 ? `${c.stage}·${STAGE_ZH[c.stage]}` : c.stage === 0 && c.status !== 'done' ? '未开始' : c.status === 'done' ? '已读完' : String(c.stage)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === '论文详情' && (selected === null
        ? <div>先在「论文队列」点选一篇论文。</div>
        : detail === null ? <div>加载中…</div>
        : (
          <dl style={{ fontSize: 13, lineHeight: 1.8 }}>
            <dt><b>{String(detail.card.title || detail.card.arxiv)}</b></dt>
            <dd>阶段：{Number(detail.card.stage) >= 1 && Number(detail.card.stage) <= 6 ? `${Number(detail.card.stage)}·${STAGE_ZH[Number(detail.card.stage)]}` : '未开始'} · 状态：{STATUS_ZH[String(detail.card.status)] ?? String(detail.card.status)} · 分：{String(detail.card.score)}</dd>
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
      {tab === '设置' && (config === null
        ? <div>加载中…</div>
        : (<SettingsForm cfg={config} saving={cfgSaving} msg={cfgMsg} onSave={saveConfig} onPatch={setConfig} />)
      )}
    </div>
  )
}

function SettingsForm({ cfg, saving, msg, onSave, onPatch }: {
  cfg: ConfigState
  saving: boolean
  msg: { ok: boolean; text: string } | null
  onSave: (cfg: ConfigState) => void
  onPatch: (cfg: ConfigState) => void
}) {
  const set = (patch: Partial<ConfigState>) => onPatch({ ...cfg, ...patch })
  const setStorage = (patch: Partial<ConfigState['storage']>) => set({ storage: { ...cfg.storage, ...patch } })
  const setWeekly = (patch: Partial<ConfigState['weekly']>) => set({ weekly: { ...cfg.weekly, ...patch } })
  const isObsidian = cfg.storage.mode === 'obsidian'
  const field: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '3px 6px', fontSize: 13, background: 'var(--input-bg, #1e2227)', color: 'inherit', border: '1px solid var(--border, #444)', borderRadius: 4 }
  const label: CSSProperties = { display: 'block', margin: '8px 0 2px', fontSize: 13, opacity: 0.85 }
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7 }}>
      <label style={label}>存储位置</label>
      <select value={cfg.storage.mode} onChange={e => setStorage({ mode: e.target.value as ConfigState['storage']['mode'] })} style={field}>
        <option value="self">self（内置位置）</option>
        <option value="obsidian">obsidian（Obsidian vault）</option>
      </select>
      {!isObsidian && (
        <>
          <label style={label}>内置研读库位置</label>
          <input value={cfg.storage.selfPath} onChange={e => setStorage({ selfPath: e.target.value })} style={field} />
        </>
      )}
      {isObsidian && (
        <>
          <label style={label}>Obsidian vault 根目录</label>
          <input value={cfg.storage.obsidianPath} onChange={e => setStorage({ obsidianPath: e.target.value })} placeholder="E:\论文研读库" style={field} />
        </>
      )}
      <label style={label}>
        <input type="checkbox" checked={cfg.weekly.enabled} onChange={e => setWeekly({ enabled: e.target.checked })} style={{ marginRight: 6 }} />
        每周自动周报
      </label>
      <label style={label}>触发时间 cron</label>
      <input value={cfg.weekly.cron} onChange={e => setWeekly({ cron: e.target.value })} style={field} />
      <div style={{ opacity: 0.6, marginTop: 2 }}>5 段：分 时 日 月 周，默认 0 9 * * 1 = 每周一 9 点</div>
      <label style={label}>时区</label>
      <input value={cfg.weekly.timeZone} onChange={e => setWeekly({ timeZone: e.target.value })} placeholder="Asia/Shanghai" style={field} />
      <label style={label}>检索分类（逗号分隔）</label>
      <input value={cfg.weekly.categories.join(',')} onChange={e => setWeekly({ categories: e.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) })} placeholder="cs.LG,cs.CL,cs.CV" style={field} />
      <label style={label}>每类条数</label>
      <input type="number" value={cfg.weekly.maxPerCategory} min={1} onChange={e => setWeekly({ maxPerCategory: Number(e.target.value) })} style={field} />
      <label style={label}>建档分数线</label>
      <input type="number" value={cfg.weekly.cardThreshold} min={1} onChange={e => setWeekly({ cardThreshold: Number(e.target.value) })} style={field} />
      <label style={label}>复现用 Python 命令</label>
      <input value={cfg.pythonCmd} onChange={e => set({ pythonCmd: e.target.value })} style={field} />
      <div style={{ marginTop: 12 }}>
        <button disabled={saving} onClick={() => onSave(cfg)} style={{ padding: '4px 16px', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}>保存</button>
        {msg && <span style={{ color: msg.ok ? '#4caf50' : '#e57373', marginLeft: 10 }}>{msg.text}</span>}
      </div>
    </div>
  )
}
