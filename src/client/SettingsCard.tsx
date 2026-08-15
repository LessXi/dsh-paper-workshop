/**
 * 论文研读工坊设置卡片（设置 → 插件 → 插件配置，与终端/视觉路由等并列）。
 * 外观 1:1 复刻内置 PluginCard（圆角边框卡片 + 标题/描述两行 + chevron 旋转 +
 * 展开体 + 右下角保存），样式走 --dsw-* 令牌，明暗主题自适应。
 * @module dsh-paper-workshop/client/SettingsCard
 */

import { useEffect, useState, type ChangeEvent } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'

/** Props 注入给卡片：指向 `/workshop` 通道的调用桥（已解包 RpcResult 信封）。 */
export interface WorkshopSettingsInjected {
  call: (endpoint: string, payload?: unknown) => Promise<unknown>
}

/** workshop_config（config/get 返回值）形状。 */
interface ConfigState {
  storage: { mode: 'self' | 'obsidian'; selfPath: string; obsidianPath: string }
  weekly: {
    enabled: boolean; cron: string; timeZone: string
    categories: string[]; maxPerCategory: number; cardThreshold: number
  }
  pythonCmd: string
}

// 与内置 PluginCard.module.css 同款规则，加前缀隔离（只注入一次）
const CSS = `
.dpw-card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}
.dpw-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dpw-card[data-open]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}
.dpw-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}
.dpw-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
.dpw-headtext{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}
.dpw-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}
.dpw-desc{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dpw-chev{color:var(--dsw-alias-label-tertiary);flex:none;display:grid;place-items:center;transition:transform .16s}
.dpw-chev[data-open]{transform:rotate(180deg)}
.dpw-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}
.dpw-footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}
.dpw-msg{min-width:0;flex:1;margin:0;font-size:12px;line-height:1.5}
.dpw-msg[data-ok]{color:var(--dsw-alias-state-success-primary)}
.dpw-msg[data-err]{color:var(--dsw-alias-label-error,var(--dsw-alias-state-error-primary))}
.dpw-save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}
.dpw-save:disabled{cursor:default;opacity:.55}
.dpw-field{width:100%;max-width:420px;box-sizing:border-box;padding:6px 10px;font:inherit;font-size:13px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:8px}
.dpw-field:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.dpw-label{display:block;margin:12px 0 4px;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
.dpw-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:3px;line-height:1.6}
.dpw-group{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:16px 0 2px;letter-spacing:.3px}
.dpw-check{display:flex;align-items:center;gap:6px;margin:12px 0 2px;cursor:pointer;font-size:12.5px;color:var(--dsw-alias-label-secondary)}
`

let cssInjected = false
function injectCss(): void {
  if (cssInjected || typeof document === 'undefined') return
  const tag = document.createElement('style')
  tag.dataset.pluginCss = 'dsh-paper-workshop/settings-card'
  tag.textContent = CSS
  document.head.appendChild(tag)
  cssInjected = true
}

export function WorkshopSettingsCard({ call }: WorkshopSettingsInjected) {
  injectCss()
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<ConfigState | null>(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open || cfg !== null) return
    call('config/get').then(r => { setCfg((r as { config: ConfigState }).config); setMsg(null) })
      .catch(e => setMsg({ ok: false, text: String(e) }))
  }, [open, cfg, call])

  const set = (patch: Partial<ConfigState>) => setCfg(c => c === null ? c : { ...c, ...patch })
  const setStorage = (patch: Partial<ConfigState['storage']>) => setCfg(c => c === null ? c : { ...c, storage: { ...c.storage, ...patch } })
  const setWeekly = (patch: Partial<ConfigState['weekly']>) => setCfg(c => c === null ? c : { ...c, weekly: { ...c.weekly, ...patch } })

  /** 保存：轻校验 → config/set → 回显。 */
  const save = async () => {
    if (cfg === null) return
    const problems: string[] = []
    if (cfg.storage.mode === 'obsidian' && cfg.storage.obsidianPath.trim() === '') problems.push('Obsidian 模式需要填 vault 根目录')
    if (cfg.weekly.cron.trim().split(/\s+/).length !== 5) problems.push('cron 需为 5 段：分 时 日 月 周')
    if (!Number.isFinite(cfg.weekly.maxPerCategory) || cfg.weekly.maxPerCategory < 1) problems.push('每类扫描条数需 ≥ 1')
    if (!Number.isFinite(cfg.weekly.cardThreshold) || cfg.weekly.cardThreshold < 1) problems.push('建档分数线需 ≥ 1')
    if (problems.length > 0) { setMsg({ ok: false, text: problems.join('；') }); return }
    setSaving(true); setMsg(null)
    try {
      const res = await call('config/set', {
        patch: {
          storage: { mode: cfg.storage.mode, selfPath: cfg.storage.selfPath, obsidianPath: cfg.storage.obsidianPath },
          weekly: {
            enabled: cfg.weekly.enabled, cron: cfg.weekly.cron, timeZone: cfg.weekly.timeZone,
            categories: cfg.weekly.categories.join(',').split(/[,，]/).map((s: string) => s.trim()).filter(Boolean),
            maxPerCategory: Number(cfg.weekly.maxPerCategory), cardThreshold: Number(cfg.weekly.cardThreshold),
          },
          pythonCmd: cfg.pythonCmd,
        },
      })
      setCfg((res as { config: ConfigState }).config)
      setMsg({ ok: true, text: '✓ 已保存并即时生效（周报调度已按新配置重排）' })
    } catch (e) {
      setMsg({ ok: false, text: String(e) })
    } finally {
      setSaving(false)
    }
  }

  const field = { className: 'dpw-field' }

  return (
    <li className="dpw-card" data-open={open || undefined}>
      <button type="button" className="dpw-header" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="dpw-headtext">
          <span className="dpw-name">论文研读工坊</span>
          <span className="dpw-desc">论文队列 / 周报 / 术语在主界面「论文工坊」视图；这里只改配置</span>
        </span>
        <span className="dpw-chev" data-open={open || undefined}><IconChevronDownOutline14 /></span>
      </button>
      {open && (
        <div className="dpw-body">
          {cfg === null
            ? <p style={{ margin: '12px 0 16px', fontSize: 12.5, color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</p>
            : (
              <div style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                <div className="dpw-group">存储位置</div>
                <label className="dpw-label">存储方式</label>
                <select className="dpw-field" value={cfg.storage.mode}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setStorage({ mode: e.target.value as ConfigState['storage']['mode'] })}>
                  <option value="self">内置位置（默认）</option>
                  <option value="obsidian">Obsidian vault</option>
                </select>
                {cfg.storage.mode === 'self'
                  ? (
                    <>
                      <label className="dpw-label">内置研读库位置</label>
                      <input className="dpw-field" value={cfg.storage.selfPath}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setStorage({ selfPath: e.target.value })} />
                    </>
                  )
                  : (
                    <>
                      <label className="dpw-label">Obsidian vault 根目录</label>
                      <input className="dpw-field" value={cfg.storage.obsidianPath} placeholder="E:\论文研读库"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setStorage({ obsidianPath: e.target.value })} />
                      <div className="dpw-hint">切换后，卡片 / 笔记 / 周报 / 术语全部写进你的 vault</div>
                    </>
                  )}

                <div className="dpw-group">每周自动周报</div>
                <label className="dpw-check">
                  <input type="checkbox" checked={cfg.weekly.enabled}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ enabled: e.target.checked })} />
                  每周自动生成
                </label>
                <label className="dpw-label">触发时间 cron</label>
                <input className="dpw-field" value={cfg.weekly.cron}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ cron: e.target.value })} />
                <div className="dpw-hint">5 段：分 时 日 月 周，默认 0 9 * * 1 = 每周一 9 点</div>
                <label className="dpw-label">时区</label>
                <input className="dpw-field" value={cfg.weekly.timeZone} placeholder="Asia/Shanghai"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ timeZone: e.target.value })} />
                <label className="dpw-label">检索分类（逗号分隔）</label>
                <input className="dpw-field" value={cfg.weekly.categories.join(',')} placeholder="cs.LG,cs.CL,cs.CV"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ categories: e.target.value.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) })} />
                <label className="dpw-label">每类扫描条数</label>
                <input className="dpw-field" inputMode="numeric" value={String(cfg.weekly.maxPerCategory)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ maxPerCategory: Number(e.target.value) })} />
                <label className="dpw-label">建档分数线（1–10）</label>
                <input className="dpw-field" inputMode="numeric" value={String(cfg.weekly.cardThreshold)}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ cardThreshold: Number(e.target.value) })} />

                <div className="dpw-group">复现环境</div>
                <label className="dpw-label">复现用 Python 命令</label>
                <input className="dpw-field" value={cfg.pythonCmd} placeholder="py -3.13"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => set({ pythonCmd: e.target.value })} />

                <div className="dpw-footer">
                  {msg !== null && <p className="dpw-msg" data-ok={msg.ok || undefined} data-err={!msg.ok || undefined}>{msg.text}</p>}
                  <button type="button" className="dpw-save" disabled={saving} onClick={() => { void save() }}>
                    {saving ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            )}
        </div>
      )}
    </li>
  )
}
