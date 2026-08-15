import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { runTool } from '../src/tools-search.ts'

// mock 全局 fetch：arXiv 返回固定 atom XML
const originalFetch = globalThis.fetch
test.mock.method(globalThis, 'fetch', async (url: string | URL) => {
  const u = String(url)
  if (u.includes('export.arxiv.org')) {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <id>http://arxiv.org/abs/2608.00001v1</id><title>Test Paper</title>
      <summary>A test summary.</summary><author><name>Alice</name></author>
      <published>2026-08-10T00:00:00Z</published><updated>2026-08-11T00:00:00Z</updated>
      <category term="cs.LG"/><link href="http://arxiv.org/abs/2608.00001v1"/>
    </entry></feed>`
    return new Response(xml, { status: 200 })
  }
  return new Response(JSON.stringify({ data: [{ citedPaper: { title: 'Ref Paper', year: 2025, venue: 'ICML', externalIds: { ArXiv: '2501.00001' } } }] }), { status: 200 })
})

test('arxiv_search 解析 entry', async () => {
  const res = await runTool('arxiv_search', { query: 'all:transformer', max_results: 5 })
  assert.equal(res.count, 1)
  assert.equal(res.items[0].id, '2608.00001v1')
  assert.equal(res.items[0].authors[0], 'Alice')
})

test('arxiv_bibtex 生成条目', async () => {
  const res = await runTool('arxiv_bibtex', { id: '2608.00001' })
  assert.ok(res.bibtex.startsWith('@article{'))
  assert.ok(res.bibtex.includes('arXiv:2608.00001'))
})

test('scholar_references 解析 citedPaper', async () => {
  const res = await runTool('scholar_references', { id: '2608.00001', limit: 10 })
  assert.equal(res.items[0].title, 'Ref Paper')
  assert.equal(res.items[0].arxiv, '2501.00001')
})
