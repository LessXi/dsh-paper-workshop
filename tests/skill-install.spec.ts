import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installSkill } from '../src/skill-install.ts'

test('installSkill 拷贝 SKILL.md 到目标技能目录', async () => {
  const target = await mkdtemp(join(tmpdir(), 'ws-skill-'))
  const dest = await installSkill(join(target, 'skills'))
  assert.ok(dest.endsWith(join('skills', 'paper-workshop', 'SKILL.md')))
  const text = await import('node:fs/promises').then(fs => fs.readFile(dest, 'utf8'))
  assert.ok(text.startsWith('---'))
  assert.ok(text.includes('name: paper-workshop'))
})
