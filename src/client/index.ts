/**
 * dsh-paper-workshop client：设置→插件→「论文研读工坊」卡片（4 视图只读面板）。
 * 注册卡片向 host 面 `/workshop` RPC 通道发起只读查询。
 * @module dsh-paper-workshop/client
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { ClientConnectionRpc, ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { WorkshopPanel, type WorkshopPanelInjected } from './Panel.tsx'

/** Required services: the wire connection handle and the slots registry. */
export const inject = ['connection', 'slots']

export type { WorkshopPanel, WorkshopPanelInjected } from './Panel.tsx'

/**
 * Client plugin body: register the workshop read-only panel under
 * Settings → Plugins →「插件配置」tab.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const rpc: ClientConnectionRpc = connection.rpc

  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    id: 'paper-workshop-panel',
    order: 40,
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
