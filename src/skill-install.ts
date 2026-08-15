/** SKILL.md 自安装：包根的 SKILL.md → <dshHome>/skills/paper-workshop/SKILL.md（覆盖写，升级即更新）。 */
import { copyFile, mkdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function installSkill(skillsDir: string): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url))
  // lib/skill-install.js → 包根 SKILL.md；tsdown unbundle 模式下 lib/ 平铺
  const candidates = [resolve(here, '../SKILL.md'), resolve(here, '../../SKILL.md')]
  let src = ''
  for (const c of candidates) {
    try { await import('node:fs/promises').then(fs => fs.access(c)); src = c; break } catch {}
  }
  if (src === '') throw new Error('SKILL.md not found in package')
  const targetDir = join(skillsDir, 'paper-workshop')
  await mkdir(targetDir, { recursive: true })
  const dest = join(targetDir, 'SKILL.md')
  await copyFile(src, dest)
  return dest
}
