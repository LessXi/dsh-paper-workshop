/**
 * dsh-paper-workshop client：两处 UI 注册。
 *
 * ① conversation.view —— 主界面：会话顶部视图栏的「论文工坊」整页视图
 *    （与对话/轨迹/瀑布流并列），论文库（左队列右详情）/ 周报 / 术语表。
 * ② settings.plugin.item —— 设置 → 插件 → 插件配置 里的一张折叠卡片，
 *    只放三组配置（存储位置 / 每周自动周报 / 复现环境）。
 *
 * v0.4.0 起不再注册 settings.section（设置左侧导航独立页）——浏览型内容
 * 属于主界面工作区，设置页只放设置。
 * @module dsh-paper-workshop/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientConnectionRpc, ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { WorkshopView, type WorkshopViewInjected } from './View.tsx'
import { WorkshopSettingsCard, type WorkshopSettingsInjected } from './SettingsCard.tsx'

/** Required services: the wire connection handle and the slots registry. */
export const inject = ['connection', 'slots']

export type { WorkshopView, WorkshopViewInjected } from './View.tsx'
export type { WorkshopSettingsCard, WorkshopSettingsInjected } from './SettingsCard.tsx'

/**
 * Client plugin body: register the workshop view tab and the settings card.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const rpc: ClientConnectionRpc = connection.rpc

  // 共用调用桥：rpc.call 返回 RpcResult 信封 {ok,value|error}，这里解包；
  // payload 归一为 null——JSON.stringify 会丢弃 undefined 键，导致服务器端
  // clientRequestSchema 校验失败（"invalid client-request message"）。
  const makeCall = (): WorkshopViewInjected['call'] => async (endpoint, payload) => {
    const result = await rpc.call('/workshop', endpoint, payload ?? null)
    if (!result.ok) {
      throw new Error(result.error?.message ?? `workshop "${endpoint}" failed`)
    }
    return result.value
  }

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'paper-workshop',
    order: 20,
    label: () => '论文工坊',
    inject: (_sessionId: string): WorkshopViewInjected => ({ call: makeCall() }),
  }, WorkshopView))

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'paper-workshop',
    order: 40,
    inject: (): WorkshopSettingsInjected => ({ call: makeCall() }),
  }, WorkshopSettingsCard))
}
