import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'docs/**', 'src-tauri/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,mjs}', 'scripts/**/*.mjs', '*.{ts,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Legacy CSS string escapes are harmless; avoid unrelated source churn.
      'no-useless-escape': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
);
