import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildHandlers } from '../src/routes.ts'
import { ensureDataRoot, upsertCard } from '../src/store.ts'

const root = await mkdtemp(join(tmpdir(), 'ws-rpc-'))
await ensureDataRoot(root)
await upsertCard(root, { arxiv: '2608.00003', title: 'NeRF', status: 'reading', stage: 2, score: 9 })
const handlers = buildHandlers({ homeDir: join(root, 'home'), dataRootOverride: root })

test('overview 端点', async () => {
  const res = await handlers['overview']!({}, new AbortController().signal)
  assert.equal(res.counts.total, 1)
  assert.equal(res.counts.reading, 1)
})

test('cards/get 端点', async () => {
  const res = await handlers['cards/get']!({ arxiv: '2608.00003' }, new AbortController().signal)
  assert.equal(res.card.title, 'NeRF')
})

test('未知端点抛错', async () => {
  await assert.rejects(async () => handlers['nope']!({}, new AbortController().signal))
})
