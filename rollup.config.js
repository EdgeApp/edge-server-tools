import babel from '@rollup/plugin-babel'
import resolve from '@rollup/plugin-node-resolve'
import mjs from 'rollup-plugin-mjs-entry'

import packageJson from './package.json'

const extensions = ['.ts']
const babelOpts = {
  babelHelpers: 'bundled',
  babelrc: false,
  extensions,
  include: ['src/**/*'],
  presets: ['@babel/typescript']
}

export default {
  external: Object.keys(packageJson.dependencies),
  input: 'src/index.ts',
  output: [
    { file: packageJson.main, format: 'cjs' },
    { file: packageJson.module, format: 'es' }
  ],
  plugins: [resolve({ extensions }), babel(babelOpts), mjs()]
}
