import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'clones/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // TypeScript already catches undefined references/globals; the base
      // `no-undef` rule doesn't understand ambient/global TS types and
      // produces false positives (typescript-eslint's own recommendation).
      'no-undef': 'off',
    },
  },
);
