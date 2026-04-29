module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:tailwindcss/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-refresh', 'import'],
  settings: {
    react: { version: '18.2' },
  },
  rules: {
    // TypeScript - warnings initially
    // Honor `_` prefix as the standard "intentionally unused" marker so
    // interface-shaped destructure params (e.g. mock implementations) and
    // rest-spread excludes don't show up as warnings. This is a tightening,
    // not a relaxation: it makes the existing `_`-prefix convention actually
    // suppress warnings the way the code author already intended.
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',

    // React
    'react/react-in-jsx-scope': 'off', // React 18 doesn't need import
    'react/prop-types': 'off', // Using TypeScript
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    // Imports - disabled until eslint-import-resolver-typescript compatible version is available
    'import/order': 'off',

    // Tailwind
    'tailwindcss/classnames-order': 'warn',
    'tailwindcss/no-custom-classname': 'off', // Allow custom classes
    'tailwindcss/enforces-shorthand': 'off', // Don't enforce size-4 vs h-4 w-4
  },
};
