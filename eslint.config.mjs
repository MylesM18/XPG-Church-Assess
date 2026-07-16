import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'node_modules/**',
    'supabase/**',
    'lib/ai/**',
    'lib/engine/**',
    'lib/methodology/**',
    'lib/report/**',
    'tests/ai/**',
    'tests/engine/**',
    'tests/methodology/**',
    'tests/report/**',
    'tests/smoke.test.ts',
    'methodology/**',
    'docs/**',
  ]),
])

export default eslintConfig
