/**
 * dsh-paper-workshop client：设置面板左侧独立导航页「论文工坊」。
 * 论文队列/详情/周报/术语表/设置 5 个视图都在这一页；注册卡片向 host 侧
 * `/workshop` RPC 通道发起查询。
 *
 * v0.3.0 起从「插件配置」卡片槽（settings.plugin.item）迁出：整个面板体量
 * 不适合塞进插件配置页的一张小卡片，改为独立导航页（settings.section），
 * 与「Agent 预设」平级。
 * @module dsh-paper-workshop/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientConnectionRpc, ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { WorkshopPanel, type WorkshopPanelInjected } from './Panel.tsx'

/** Required services: the wire connection handle and the slots registry. */
export const inject = ['connection', 'slots']

export type { WorkshopPanel, WorkshopPanelInjected } from './Panel.tsx'

/**
 * Client plugin body: register the workshop panel as its own settings
 * nav section (「论文工坊」), sibling of 通用设置/模型/插件/Agent 预设.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const rpc: ClientConnectionRpc = connection.rpc

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'paper-workshop',
    order: 40,
    label: () => '论文工坊',
    inject: (): WorkshopPanelInjected => ({
      // rpc.call returns the RpcResult envelope {ok,value|error} (same as dsh-polling);
      // unwrap it so the panel receives raw values. ok:false -> throw (caught by the panel).
      // payload 归一为 null：JSON.stringify 会丢弃 undefined 键，导致服务器端
      // clientRequestSchema 校验失败（"invalid client-request message"）——payload 键必须存在。
      call: async (endpoint, payload) => {
        const result = await rpc.call('/workshop', endpoint, payload ?? null)
        if (!result.ok) {
          throw new Error(result.error?.message ?? `workshop "${endpoint}" failed`)
        }
        return result.value
      },
    }),
  }, WorkshopPanel))
}
