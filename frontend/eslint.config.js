import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default [
  { ignores: ['dist/**'] },
  js.configs.recommended,
  react.configs.flat.recommended,
  security.configs.recommended,
  { settings: { react: { version: '18.3' } } },
  {
    // Node-context config files (not part of the browser bundle)
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off', // no PropTypes convention in this codebase
      'react/react-in-jsx-scope': 'off', // React 18 automatic JSX runtime
      'react/no-unescaped-entities': 'off', // cosmetic; not a real bug
      // This codebase's standard data-loading pattern is useEffect + a
      // fetch-and-setState callback (fetchX() on mount/dep change), used
      // pervasively across every page. This newer rule flags that whole
      // established pattern; disabled rather than churning every page.
      'react-hooks/set-state-in-effect': 'off',
      // Flags a mismatch against this project's React Compiler, which isn't
      // in use here (no react-compiler babel plugin configured) — downgraded
      // rather than restructuring working callbacks around a build target
      // this app doesn't target.
      'react-hooks/preserve-manual-memoization': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
