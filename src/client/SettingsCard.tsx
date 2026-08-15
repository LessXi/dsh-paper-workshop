/**
 * 论文研读工坊设置卡片（设置 → 插件 → 插件配置，与终端/视觉路由等并列）。
 * 折叠时一行：图标 + 标题 + 说明；展开后是三组配置（存储位置 / 每周自动周报 / 复现环境）
 * + 保存按钮。全部走官方原语与 --dsw-* 令牌。
 * @module dsh-paper-workshop/client/SettingsCard
 */

import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react'
import { Button, DisclosureRow, Input, IconDataOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'

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

const T = {
  text: 'var(--dsw-alias-label-primary)',
  sub: 'var(--dsw-alias-label-secondary)',
  faint: 'var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary))',
  border: 'var(--dsw-alias-border-l1)',
  brand: 'var(--dsw-alias-brand-primary)',
  ok: 'var(--dsw-alias-state-success-primary)',
  err: 'var(--dsw-alias-state-error-primary)',
}

const label: CSSProperties = { display: 'block', margin: '10px 0 4px', fontSize: 12.5, color: T.sub }
const field = { style: { width: '100%', maxWidth: 420, boxSizing: 'border-box' } }
const hint: CSSProperties = { fontSize: 12, color: T.faint, marginTop: 3, lineHeight: 1.6 }
const groupTitle: CSSProperties = { fontSize: 12, fontWeight: 600, color: T.sub, margin: '14px 0 2px', letterSpacing: 0.3 }

export function WorkshopSettingsCard({ call }: WorkshopSettingsInjected) {
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
      setMsg({ ok: true, text: '✓ 已保存并即时生效' })
    } catch (e) {
      setMsg({ ok: false, text: String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <DisclosureRow
      icon={<IconDataOutline16 />}
      title="论文研读工坊"
      open={open}
      expandable
      onToggle={() => setOpen(o => !o)}
      expandOnRowClick
      collapsedContent="论文队列 / 周报 / 术语在主界面「论文工坊」视图；这里只改配置"
    >
      {cfg === null
        ? <div style={{ fontSize: 12.5, color: T.faint, padding: '4px 0 12px' }}>{open ? '加载中…' : null}</div>
        : (
          <div style={{ fontSize: 12.5, lineHeight: 1.65, paddingBottom: 10 }}>
            <div style={groupTitle}>存储位置</div>
            <label style={label}>存储方式</label>
            <select
              value={cfg.storage.mode}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setStorage({ mode: e.target.value as ConfigState['storage']['mode'] })}
              style={{
                width: '100%', maxWidth: 420, boxSizing: 'border-box', padding: '6px 8px', fontSize: 12.5,
                background: 'var(--dsw-alias-bg-base)', color: T.text,
                border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 8,
              }}
            >
              <option value="self">内置位置（默认）</option>
              <option value="obsidian">Obsidian vault</option>
            </select>
            {cfg.storage.mode === 'self'
              ? (
                <>
                  <label style={label}>内置研读库位置</label>
                  <Input {...field} value={cfg.storage.selfPath} onChange={(e: ChangeEvent<HTMLInputElement>) => setStorage({ selfPath: e.target.value })} />
                </>
              )
              : (
                <>
                  <label style={label}>Obsidian vault 根目录</label>
                  <Input {...field} value={cfg.storage.obsidianPath} onChange={(e: ChangeEvent<HTMLInputElement>) => setStorage({ obsidianPath: e.target.value })} placeholder="E:\论文研读库" />
                  <div style={hint}>切换后，卡片 / 笔记 / 周报 / 术语全部写进你的 vault</div>
                </>
              )}

            <div style={groupTitle}>每周自动周报</div>
            <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={cfg.weekly.enabled} onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ enabled: e.target.checked })} />
              每周自动生成
            </label>
            <label style={label}>触发时间 cron</label>
            <Input {...field} value={cfg.weekly.cron} onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ cron: e.target.value })} />
            <div style={hint}>5 段：分 时 日 月 周，默认 0 9 * * 1 = 每周一 9 点</div>
            <label style={label}>时区</label>
            <Input {...field} value={cfg.weekly.timeZone} onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ timeZone: e.target.value })} placeholder="Asia/Shanghai" />
            <label style={label}>检索分类（逗号分隔）</label>
            <Input {...field} value={cfg.weekly.categories.join(',')} onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ categories: e.target.value.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) })} placeholder="cs.LG,cs.CL,cs.CV" />
            <label style={label}>每类扫描条数</label>
            <Input {...field} inputMode="numeric" value={String(cfg.weekly.maxPerCategory)} onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ maxPerCategory: Number(e.target.value) })} />
            <label style={label}>建档分数线（1–10）</label>
            <Input {...field} inputMode="numeric" value={String(cfg.weekly.cardThreshold)} onChange={(e: ChangeEvent<HTMLInputElement>) => setWeekly({ cardThreshold: Number(e.target.value) })} />

            <div style={groupTitle}>复现环境</div>
            <label style={label}>复现用 Python 命令</label>
            <Input {...field} value={cfg.pythonCmd} onChange={(e: ChangeEvent<HTMLInputElement>) => set({ pythonCmd: e.target.value })} placeholder="py -3.13" />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
              <Button variant="primary" size="sm" disabled={saving} onClick={() => { void save() }}>
                {saving ? '保存中…' : '保存'}
              </Button>
              {msg !== null && (
                <span style={{ fontSize: 12.5, color: msg.ok ? T.ok : T.err }}>{msg.text}</span>
              )}
            </div>
          </div>
        )}
    </DisclosureRow>
  )
}
