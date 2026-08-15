import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isoWeekOf, nextRunAfter, renderWeeklyPrompt } from '../src/weekly.ts'
import { DEFAULT_CONFIG } from '../src/config.ts'

test('isoWeekOf：周一属于新周', () => {
  // 2026-08-17 是周一；2026-08-16 是周日（属 W33）
  assert.equal(isoWeekOf(new Date('2026-08-17T09:00:00+08:00'), 'Asia/Shanghai'), '2026-W34')
  assert.equal(isoWeekOf(new Date('2026-08-16T23:00:00+08:00'), 'Asia/Shanghai'), '2026-W33')
})

test('nextRunAfter：每周一 9 点的下次触发', () => {
  const from = Date.parse('2026-08-15T12:00:00+08:00') // 周六
  const next = nextRunAfter('0 9 * * 1', from, 'Asia/Shanghai')!
  const nextDate = new Date(next)
  assert.equal(nextDate.toISOString().slice(0, 10), '2026-08-17') // 下周一
})

test('nextRunAfter：cron 每天触发则最近一天', () => {
  const from = Date.parse('2026-08-15T10:00:00+08:00')
  const next = nextRunAfter('0 9 * * *', from, 'Asia/Shanghai')!
  assert.equal(new Date(next).toISOString().slice(0, 10), '2026-08-16')
})

test('renderWeeklyPrompt 含分类与阈值', () => {
  const p = renderWeeklyPrompt(DEFAULT_CONFIG, '2026-W33')
  assert.ok(p.includes('cs.LG'))
  assert.ok(p.includes('2026-W33'))
  assert.ok(p.includes('7'))
})
