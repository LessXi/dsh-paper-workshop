/** 每周 arXiv 周报：cron 调度 → 任务会话（agents.create）→ followup 周报 prompt。模式参照 dsh-polling scheduler/session-factory。 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { loadConfig, resolveDataRoot, type WorkshopConfig } from './config.ts'

// ---------- 纯函数 ----------

/** 指定时区的墙上时间（年月日时分）。 */
function wallClock(ms: number, timeZone: string): { y: number; m: number; d: number; hh: number; mm: number; wd: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(ms))
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), hh: Number(get('hour')), mm: Number(get('minute')), wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')) }
}

/** ISO 周（如 2026-W33），按指定时区的墙上日期计算。 */
function isoWeekOfDate(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d))
  const day = (date.getUTCDay() + 6) % 7 // 周一=0
  date.setUTCDate(date.getUTCDate() - day + 3) // 本周四
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDay = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000))
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

export function isoWeekOf(date: Date, timeZone: string): string {
  const c = wallClock(date.getTime(), timeZone)
  return isoWeekOfDate(c.y, c.m, c.d)
}

/** 解析 cron 字段（支持 * 数字 , - /）。 */
function parseField(spec: string, min: number, max: number): (n: number) => boolean {
  const set = new Set<number>()
  for (const part of spec.split(',')) {
    const [range, stepRaw] = part.split('/')
    const step = stepRaw === undefined ? 1 : Number(stepRaw)
    let lo = min, hi = max
    if (range !== undefined && range !== '*') {
      if (range.includes('-')) { const [a, b] = range.split('-').map(Number); lo = a!; hi = b! }
      else { lo = hi = Number(range) }
    }
    for (let n = lo; n <= hi; n += step) set.add(n)
  }
  return (n: number) => set.has(n)
}

/** 下次触发时刻（epoch ms）。分钟步进，最多 8 天，找不到返回 undefined。 */
export function nextRunAfter(cron: string, fromMs: number, timeZone: string): number | undefined {
  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) return undefined
  const mm = parseField(fields[0]!, 0, 59)
  const hh = parseField(fields[1]!, 0, 23)
  const dom = parseField(fields[2]!, 1, 31)
  const mon = parseField(fields[3]!, 1, 12)
  const wd = parseField(fields[4]!, 0, 6)
  let t = Math.floor(fromMs / 60000) * 60000 + 60000 // 从下一分钟起
  const limit = fromMs + 8 * 24 * 3600 * 1000
  while (t <= limit) {
    const c = wallClock(t, timeZone)
    if (mm(c.mm) && hh(c.hh) && dom(c.d) && mon(c.m) && wd(c.wd)) return t
    t += 60000
  }
  return undefined
}

export function renderWeeklyPrompt(cfg: WorkshopConfig, week: string): string {
  const cats = cfg.weekly.categories.join('、')
  return [
    `[论文周报 ${week}]`,
    `当前任务：执行每周 arXiv 前沿追踪（研读工坊阶段 0 自动化）。`,
    '',
    `1. 用 arxiv_search 分别检索 ${cats} 最近一周新论文（每类 max_results=${cfg.weekly.maxPerCategory}）。`,
    `2. 对每篇做三问筛选：①类型（新方法/测量/理论/综述/工具）②与已有研究的相关性（可 workshop_overview 查档案）③可信度。打价值分 0-10（对用户研究方向的实用价值，不是论文质量）。`,
    `3. 输出 Markdown 周报：分三类表格（标题一句/类型/价值分/一句话价值/判定），判定取 later 或 跳过。`,
    `4. 判定 later 且价值分 ≥${cfg.weekly.cardThreshold} 的论文：paper_card upsert 建档（status: later、score、one_line、source_week: "${week}"）；已有档案则只更新 one_line。`,
    `5. 周报正文保存：调 pwsh 写入 <数据根>/reports/${week}-arxiv.md（数据根用 workshop_overview 的 dataRoot 字段）。`,
    '',
    '注意：只筛选与建卡，不开启精读；token 从紧，看不准的宁可标 later 人工定夺。',
  ].join('\n')
}

// ---------- 调度器 ----------

export interface WeeklyState { sessionId: string | null; lastRunAt: string | null; lastOutcome: string | null; nextRunAt: string | null }

export class WeeklyScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private state: WeeklyState = { sessionId: null, lastRunAt: null, lastOutcome: null, nextRunAt: null }
  constructor(
    private readonly ctx: Context,
    private readonly homeDir: string,
  ) {}

  start(): void { void this.arm() }

  async reload(): Promise<void> { await this.dispose(); this.start() }

  async dispose(): Promise<void> {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null }
  }

  private async arm(): Promise<void> {
    const cfg = await loadConfig(this.homeDir)
    if (!cfg.weekly.enabled) return
    const next = nextRunAfter(cfg.weekly.cron, Date.now(), cfg.weekly.timeZone)
    this.state.nextRunAt = next === undefined ? null : new Date(next).toISOString()
    if (next === undefined) return
    const delay = Math.max(next - Date.now(), 0)
    this.timer = setTimeout(() => { void this.fire() }, delay)
    this.ctx.logger.info(`paper-workshop: weekly armed at ${this.state.nextRunAt}`)
  }

  /** 立即触发（cron 到点或 weekly_report 工具）。 */
  async triggerNow(): Promise<'ok' | 'failed'> {
    return (await this.fire()) ? 'ok' : 'failed'
  }

  private async fire(): Promise<boolean> {
    try {
      const cfg = await loadConfig(this.homeDir)
      const week = isoWeekOf(new Date(), cfg.weekly.timeZone)
      const prompt = renderWeeklyPrompt(cfg, week)
      const agents = this.ctx.get('agents')
      if (agents === undefined) throw new Error('agents service 不可用')
      // 复用或新建任务会话
      let agent = this.state.sessionId === null ? undefined : agents.get(this.state.sessionId as SessionId)
      if (agent === undefined) {
        const sessionId = randomUUID() as SessionId
        const presets = this.ctx.get('agentPresets')
        let agentPreset: string | undefined
        if (presets !== undefined) agentPreset = (await presets.resolve(undefined)).id
        const handle = await agents.create({
          sessionId,
          meta: { cwd: resolveDataRoot(cfg), ...agentPreset === undefined ? {} : { agentPreset } },
          ...(presets === undefined ? {} : { setup: async (agentCtx: import('@deepseek-ai/cordis').Context) => { await presets.mount(agentCtx, agentPreset!) } }),
        })
        this.state.sessionId = sessionId
        agent = handle.agent
      }
      agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'plugin', plugin: 'paper-workshop' } }))
      this.state.lastRunAt = new Date().toISOString()
      this.state.lastOutcome = 'ok'
      return true
    } catch (error: unknown) {
      this.ctx.logger.warn(`paper-workshop: weekly fire failed: ${String(error)}`)
      this.state.lastOutcome = 'failed'
      return false
    } finally {
      try {
        await this.arm() // 排下一次；成功与失败路径都重排，周报循环持续
      } catch (error: unknown) {
        this.ctx.logger.warn(`paper-workshop: weekly re-arm failed: ${String(error)}`)
      }
    }
  }
}
