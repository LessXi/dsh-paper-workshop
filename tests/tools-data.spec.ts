import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDataTool } from '../src/tools-data.ts'
import { ensureDataRoot } from '../src/store.ts'

const home = await mkdtemp(join(tmpdir(), 'ws-dt-home-'))
const root = await mkdtemp(join(tmpdir(), 'ws-dt-root-'))
await ensureDataRoot(root)

test('paper_card upsert→get→list 全链路', async () => {
  await runDataTool('paper_card', { action: 'upsert', card: { arxiv: '2608.00002', title: 'Mamba', status: 'later', score: 8 } }, { homeDir: home, dataRootOverride: root })
  const got = await runDataTool('paper_card', { action: 'get', arxiv: '2608.00002' }, { homeDir: home, dataRootOverride: root })
  assert.equal(got.card.title, 'Mamba')
  const list = await runDataTool('paper_card', { action: 'list' }, { homeDir: home, dataRootOverride: root })
  assert.equal(list.cards.length, 1)
})

test('paper_card checkpoint 读写', async () => {
  await runDataTool('paper_card', { action: 'checkpoint', arxiv: '2608.00002', at: '站点2', pending: 'Q1' }, { homeDir: home, dataRootOverride: root })
  const got = await runDataTool('paper_card', { action: 'get', arxiv: '2608.00002' }, { homeDir: home, dataRootOverride: root })
  assert.equal(got.checkpoint?.at, '站点2')
})

test('workshop_config get/set', async () => {
  const before = await runDataTool('workshop_config', { action: 'get' }, { homeDir: home, dataRootOverride: root })
  assert.equal(before.config.storage.mode, 'self')
  await runDataTool('workshop_config', { action: 'set', patch: { weekly: { cardThreshold: 8 } } }, { homeDir: home, dataRootOverride: root })
  const after = await runDataTool('workshop_config', { action: 'get' }, { homeDir: home, dataRootOverride: root })
  assert.equal(after.config.weekly.cardThreshold, 8)
})

test('glossary 与 overview', async () => {
  await runDataTool('glossary', { action: 'upsert', term: { slug: 'mamba', zh: '状态空间模型', en: 'Mamba', plain: '线性复杂度的序列模型', first_seen: '2608.00002', related: [] } }, { homeDir: home, dataRootOverride: root })
  const ov = await runDataTool('workshop_overview', {}, { homeDir: home, dataRootOverride: root })
  assert.equal(ov.cards.length, 1)
  assert.equal(ov.glossary.length, 1)
})
