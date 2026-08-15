import type { UserConfig } from 'tsdown'

/** Web 壳冻结模块表共享的模块标识（打包时排除，运行时从壳解析）。 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
] as const

/** Node host 半面：ESM，harness 包全部外部化（由宿主进程提供）。 */
const nodeConfig: UserConfig = {
  name: 'dsh-paper-workshop',
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2022',
  dts: false,
  clean: true,
  external: [/^@deepseek-ai\//],
  outputOptions: { entryFileNames: 'index.js' },
}

/** 浏览器 client 半面：CJS factory + ModuleLoader 装载契约。 */
const clientConfig: UserConfig = {
  name: 'dsh-paper-workshop/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: [...PLATFORM_MODULES],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
    'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
  },
  noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-paper-workshop", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [nodeConfig, clientConfig]
