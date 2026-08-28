import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    extends: [
      js.configs.recommended,
      // Without this the parser is plain espree, which chokes on every type
      // annotation — `npm run lint` reported a parse error for each .ts/.tsx
      // file and linted none of them.
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // typescript-eslint's version understands types and interfaces; the base
      // rule double-reports on them.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      // Adopting lint on an existing codebase: the rules below flag long-standing
      // patterns rather than defects, so they warn instead of blocking. They stay
      // visible in `npm run lint` output and are worth burning down over time.
      // 23 sites, mostly `catch (e: any)` and untyped event/file handlers.
      '@typescript-eslint/no-explicit-any': 'warn',
      // New in eslint-plugin-react-hooks v7. These flag real smells but every hit
      // here is a pre-existing fetch-into-state effect; fixing them is a refactor.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
])
