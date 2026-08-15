/** 数据根安全解析：obsidian 模式未配置路径时回落 self 默认（不抛错打断启动）。 */
import { resolveDataRoot, type WorkshopConfig } from './config.ts'

export function resolveDataRootSafe(cfg: WorkshopConfig): string {
  try { return resolveDataRoot(cfg) } catch {
    return resolveDataRoot({ ...cfg, storage: { ...cfg.storage, mode: 'self' } })
  }
}
