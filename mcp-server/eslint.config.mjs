import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // TypeScript already catches undefined references/globals; the base
      // `no-undef` rule doesn't understand ambient/global TS types and
      // produces false positives (typescript-eslint's own recommendation).
      'no-undef': 'off',
      // stdout is JSON-RPC only for a stdio MCP server: any console.log would
      // corrupt the protocol stream. console.error/warn go to stderr, which is
      // safe, so they stay allowed for the stderr logger (src/log.ts).
      'no-console': ['error', { allow: ['error', 'warn'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // @devdigest/shared is imported type-only: runtime response shapes are
      // parsed with the local Zod schemas in src/api/schemas.ts, never the
      // vendored runtime zod schemas themselves (see plan A3).
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@devdigest/shared',
              allowTypeImports: true,
              message: 'type-only: runtime schemas live in src/api/schemas.ts',
            },
          ],
        },
      ],
    },
  },
  {
    // Onion layering, lint-enforced: domain/* depends on domain/ports.ts (the
    // port) and must stay SDK-free and fetch-free; a genuine architecture
    // fitness test, not just a convention (arch review fix 7).
    files: ['src/domain/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@devdigest/shared',
              allowTypeImports: true,
              message: 'type-only: runtime schemas live in src/api/schemas.ts',
            },
          ],
          patterns: [
            {
              group: ['**/api/*', '**/api/**'],
              message: 'depend on domain/ports.ts, not the HTTP adapter',
            },
            {
              group: ['@modelcontextprotocol/*', '@modelcontextprotocol/**'],
              message: 'domain/* must stay MCP-SDK-free — that dependency belongs in src/tools/*.ts or src/server.ts',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'domain/* must not call fetch directly — use the injected DevDigestApi port (src/domain/ports.ts)' },
      ],
    },
  },
  {
    // tools/* depends on domain/ports.ts, never on the concrete HTTP adapter
    // or the composition root (server.ts) that wires it together (arch review
    // fix 7 / F2).
    files: ['src/tools/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@devdigest/shared',
              allowTypeImports: true,
              message: 'type-only: runtime schemas live in src/api/schemas.ts',
            },
          ],
          patterns: [
            {
              group: ['**/api/*', '**/api/**'],
              message: 'depend on domain/ports.ts, not the HTTP adapter',
            },
            {
              group: ['../server.js', '../server'],
              message: 'tools/* must not import the composition root — import ServerDeps from ./deps.js instead',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'tools/* must not call fetch directly — use the injected DevDigestApi via ServerDeps' },
      ],
    },
  },
);
