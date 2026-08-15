import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureDataRoot, parseFrontmatter, serializeFrontmatter, upsertCard, getCard, listCards, writeCheckpoint, upsertGlossary, listGlossary, writeReport, listReports } from '../src/store.ts'

const root = await mkdtemp(join(tmpdir(), 'ws-store-'))
await ensureDataRoot(root)

test('frontmatter 往返：标量/数组/对象数组', () => {
  const data = { arxiv: '2608.1', score: 9, questions: ['q1', 'q2'], review: [{ concept: '注意力', added: '2026-08-15', source: '3.2' }], tags: ['paper'] }
  const text = serializeFrontmatter(data, '正文')
  const back = parseFrontmatter(text)
  assert.equal(back.data.arxiv, '2608.1')
  assert.equal(back.data.score, 9)
  assert.deepEqual(back.data.questions, ['q1', 'q2'])
  assert.deepEqual(back.data.review, [{ concept: '注意力', added: '2026-08-15', source: '3.2' }])
  assert.equal(back.body, '正文')
})

test('upsertCard 幂等合并：二次写入保留未覆盖字段与正文', async () => {
  await upsertCard(root, { arxiv: '2608.00001', title: 'T1', status: 'later', score: 8 })
  await writeCheckpoint(root, '2608.00001', { at: '站点2·注意力', pending: '为什么除以 √d', review: '注意力（2026-08-15，3.2）' })
  await upsertCard(root, { arxiv: '2608.00001', score: 9, stage: 2 }) // 只改两个字段
  const card = await getCard(root, '2608.00001')!
  assert.equal(card.title, 'T1')
  assert.equal(card.score, 9)
  assert.equal(card.stage, 2)
  assert.ok(card.body.includes('## 断点'))
  assert.ok(card.body.includes('站点2·注意力'))
})

test('writeCheckpoint 覆盖旧断点小节', async () => {
  await writeCheckpoint(root, '2608.00001', { at: '站点3' })
  const card = await getCard(root, '2608.00001')!
  assert.ok(card.body.includes('站点3'))
  assert.ok(!card.body.includes('站点2·注意力'))
})

test('repro 复现清单：对象入档 → frontmatter 往返 → 逐项更新', async () => {
  await upsertCard(root, {
    arxiv: '2608.00002', title: '复现实验', status: 'reading', stage: 5,
    repro: { env: true, code: false, results: false, note: '依赖装好了，官方 demo 还没跑' },
  })
  const c1 = await getCard(root, '2608.00002')!
  assert.deepEqual(c1.repro, { env: true, code: false, results: false, note: '依赖装好了，官方 demo 还没跑' })
  // 用户口头「代码跑通了」→ 只更新一项，其余保留
  await upsertCard(root, { arxiv: '2608.00002', repro: { env: true, code: true, results: false, note: 'demo 跑通；指标差 12%' } })
  const c2 = await getCard(root, '2608.00002')!
  assert.equal(c2.repro.code, true)
  assert.equal(c2.repro.results, false)
  assert.ok(c2.repro.note.includes('12%'))
  // 未写 repro 的老档案默认全 false、不炸
  await upsertCard(root, { arxiv: '2608.00003', title: '无复现' })
  const c3 = await getCard(root, '2608.00003')!
  assert.deepEqual(c3.repro, { env: false, code: false, results: false, note: '' })
})

test('glossary upsert/list', async () => {
  await upsertGlossary(root, { slug: 'attention', zh: '注意力机制', en: 'attention', plain: '决定看哪儿的一种加权', first_seen: '2608.00001', related: [] })
  const terms = await listGlossary(root)
  assert.equal(terms.length, 1)
  assert.equal(terms[0].zh, '注意力机制')
})

test('report 写入与列表元数据', async () => {
  await writeReport(root, '2026-W33', '# 周报\n内容')
  const reports = await listReports(root)
  assert.equal(reports[0].week, '2026-W33')
  assert.ok(reports[0].path.endsWith('2026-W33-arxiv.md'))
})
