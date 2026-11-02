import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'out/**', 'dist/**', 'release/**', 'coverage/**', 'playwright-report/**', 'test-results/**']
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs', 'scripts/*.mjs', 'build/*.cjs']
        },
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always']
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules }
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      // The financial engine must stay pure: no Electron, Node, database, network or UI imports.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['electron', 'electron/*'], message: 'Domain engine must not depend on Electron.' },
            { group: ['node:*', 'fs', 'path', 'os', 'child_process', 'http', 'https', 'net'], message: 'Domain engine must not depend on Node built-ins.' },
            { group: ['better-sqlite3', 'exceljs', 'papaparse', 'react', 'react-dom'], message: 'Domain engine must not depend on I/O or UI libraries.' },
            { group: ['@renderer/*', '../renderer/*', '../../renderer/*', '../storage/*', '../../storage/*', '../import/*', '../../import/*', '../export/*', '../../export/*'], message: 'Domain engine must not import application layers.' }
          ]
        }
      ]
    }
  },
  {
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: { globals: { ...globals.node } },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
);
