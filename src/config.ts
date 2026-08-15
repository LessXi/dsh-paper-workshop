/** 配置读写与数据根解析。config.json 固定存插件主目录（dshHome/paper-workshop/），数据根由 storage 决定。 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface WorkshopConfig {
  storage: { mode: 'self' | 'obsidian'; selfPath: string; obsidianPath: string }
  weekly: {
    enabled: boolean; cron: string; timeZone: string
    categories: string[]; maxPerCategory: number; cardThreshold: number
  }
  pythonCmd: string
}

export const DEFAULT_CONFIG: WorkshopConfig = {
  storage: { mode: 'self', selfPath: '~/.dsh/paper-workshop', obsidianPath: '' },
  weekly: {
    enabled: true, cron: '0 9 * * 1', timeZone: 'Asia/Shanghai',
    categories: ['cs.LG', 'cs.CL', 'cs.CV'], maxPerCategory: 10, cardThreshold: 7,
  },
  pythonCmd: 'py -3.13',
}

function deepMerge<T>(base: T, patch: unknown): T {
  if (Array.isArray(base)) return (Array.isArray(patch) ? patch : base) as T
  if (base !== null && typeof base === 'object') {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    if (patch !== null && typeof patch === 'object') {
      for (const [k, v] of Object.entries(patch as Record<string, unknown>)) out[k] = deepMerge(out[k], v)
    }
    return out as T
  }
  return (patch === undefined ? base : patch) as T
}

/** 浅对象递归合并 patch：对象递归，数组/标量整体替换（同 deepMerge 语义，patch 逐字段覆盖）。 */
export function mergePatch<T>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v !== null && typeof v === 'object' && !Array.isArray(v) ? mergePatch(out[k], v as Record<string, unknown>) : v
  }
  return out as T
}

/** 读插件主目录下的 config.json；不存在或字段缺失时合并默认并写回。 */
export async function loadConfig(homeDir: string): Promise<WorkshopConfig> {
  await mkdir(homeDir, { recursive: true })
  const file = join(homeDir, 'config.json')
  let raw: unknown = {}
  try { raw = JSON.parse(await readFile(file, 'utf8')) } catch { /* 首次或损坏：用默认重建 */ }
  const cfg = deepMerge(structuredClone(DEFAULT_CONFIG), raw)
  await writeFile(file, JSON.stringify(cfg, null, 2), 'utf8')
  return cfg
}

export async function saveConfig(homeDir: string, cfg: WorkshopConfig): Promise<void> {
  await mkdir(homeDir, { recursive: true })
  await writeFile(join(homeDir, 'config.json'), JSON.stringify(cfg, null, 2), 'utf8')
}

/** 数据根：self 模式展开 selfPath 的 ~；obsidian 模式取 vault 路径（空则抛错）。 */
export function resolveDataRoot(config: WorkshopConfig): string {
  if (config.storage.mode === 'obsidian') {
    if (config.storage.obsidianPath.trim() === '') throw new Error('obsidian 模式需要配置 obsidianPath（vault 根目录）')
    return config.storage.obsidianPath
  }
  return config.storage.selfPath.replace(/^~(?=[/\\])/, homedir())
}

export async function ensureDataRoot(root: string): Promise<void> {
  await mkdir(join(root, 'cards'), { recursive: true })
  for (const sub of ['notes', 'reports', 'glossary', 'pdfs']) {
    await mkdir(join(root, sub), { recursive: true })
  }
}
