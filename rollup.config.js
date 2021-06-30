import resolve from '@rollup/plugin-node-resolve'
import sucrase from '@rollup/plugin-sucrase'
import mjs from 'rollup-plugin-mjs-entry'

import packageJson from './package.json'

const extensions = ['.ts']

export default {
  external: Object.keys(packageJson.dependencies),
  input: 'src/index.ts',
  output: [
    { file: packageJson.main, format: 'cjs' },
    { file: packageJson.module, format: 'es' }
  ],
  plugins: [
    resolve({ extensions }),
    sucrase({
      exclude: ['node_modules/**'],
      transforms: ['typescript']
    }),
    mjs()
  ]
}
