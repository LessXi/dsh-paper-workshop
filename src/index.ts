/** dsh-paper-workshop — 论文研读工坊插件（host 面）。 */
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { ensureDataRoot, loadConfig } from './config.ts'
import { resolveDataRootSafe } from './data-root.ts'
import { registerDataTools } from './tools-data.ts'
import { registerSearchTools } from './tools-search.ts'
import { installSkill } from './skill-install.ts'
import { WeeklyScheduler } from './weekly.ts'

export const name = 'paper-workshop'
export const inject = ['tools', 'agents']

const HOME_DIR = dshHomePath('paper-workshop')

export async function apply(ctx: Context): Promise<void> {
  // 0) 初始化：config + 数据根 + skill 自安装
  const cfg = await loadConfig(HOME_DIR)
  await ensureDataRoot(resolveDataRootSafe(cfg)).catch(err => ctx.logger.warn(`paper-workshop: data root init failed: ${String(err)}`))
  await installSkill(dshHomePath('skills')).catch(err => ctx.logger.warn(`paper-workshop: skill install failed: ${String(err)}`))

  // 1) 周报调度
  const weekly = new WeeklyScheduler(ctx, HOME_DIR)
  weekly.start()

  ctx.effect(() => {
    // 2) 检索工具 + 数据工具
    const disposeSearch = registerSearchTools(ctx)
    const disposeData = registerDataTools(ctx, { homeDir: HOME_DIR })
    // 3) weekly_report：立即手动跑本周周报
    const disposeWeeklyTool = ctx.tools.register(defineTool({
      name: 'weekly_report',
      description: '立即执行一次 arXiv 每周前沿追踪（不等 cron 到点）：扫分类新论文→三问筛选打分→周报落盘→高分建卡。用户说「跑一下周报」「现在出周报」时用。',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: true },
        render: (_a, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(_args, exec) {
        exec.signal.throwIfAborted()
        const outcome = await weekly.triggerNow()
        return { outcome, note: outcome === 'ok' ? '周报任务已派发到任务会话执行' : '周报触发失败，查看插件日志' } as never
      },
    }))
    return () => {
      disposeWeeklyTool()
      disposeData()
      disposeSearch()
      void weekly.dispose()
    }
  }, 'paper-workshop.lifecycle()')
}
