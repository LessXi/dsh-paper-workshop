import { access, constants, readFile } from 'node:fs/promises'
for (const p of ['lib/index.js', 'lib/client.js']) {
  await access(p, constants.F_OK).catch(() => { throw new Error(`missing build output: ${p}`) })
}
const client = await readFile('lib/client.js', 'utf8')
if (!client.includes('window.__ModuleLoader__.load')) throw new Error('client bundle missing ModuleLoader contract')
console.log('smoke ok')
