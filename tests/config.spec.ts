import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG, loadConfig, resolveDataRoot } from '../src/config.ts'

const base = await mkdtemp(join(tmpdir(), 'ws-cfg-'))

test('loadConfig 无文件时写回默认配置', async () => {
  const cfg = await loadConfig(join(base, 'a'))
  assert.equal(cfg.storage.mode, 'self')
  assert.equal(cfg.weekly.cron, '0 9 * * 1')
  const raw = JSON.parse(await readFile(join(base, 'a', 'config.json'), 'utf8'))
  assert.equal(raw.weekly.categories.length, 3)
})

test('loadConfig 已有文件时字段级合并默认', async () => {
  const dir = join(base, 'b')
  await import('node:fs/promises').then(fs => fs.mkdir(dir, { recursive: true }))
  await writeFile(join(dir, 'config.json'), JSON.stringify({ weekly: { cardThreshold: 8 } }), 'utf8')
  const cfg = await loadConfig(dir)
  assert.equal(cfg.weekly.cardThreshold, 8)
  assert.equal(cfg.weekly.maxPerCategory, 10) // 未覆盖字段取默认
})

test('resolveDataRoot self 模式展开 ~ 为绝对路径', () => {
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.storage.selfPath = '~/my-papers'
  const root = resolveDataRoot(cfg)
  assert.ok(!root.includes('~'))
  assert.ok(root.endsWith('my-papers'))
})

test('resolveDataRoot obsidian 模式空路径抛错', () => {
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.storage.mode = 'obsidian'
  cfg.storage.obsidianPath = ''
  assert.throws(() => resolveDataRoot(cfg), /obsidianPath/)
})
