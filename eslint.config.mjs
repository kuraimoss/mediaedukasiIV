// Konfigurasi ESLint (flat config) tanpa dependensi tambahan.
// Hanya aturan pencegah bug; gaya penulisan tidak diatur di sini.

const browserGlobals = [
  'window', 'document', 'requestAnimationFrame', 'IntersectionObserver', 'ResizeObserver',
  'getComputedStyle', 'setTimeout', 'clearTimeout', 'Intl', 'globalThis'
];

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none' }],
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-unsafe-finally': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-sparse-arrays': 'error',
  'no-cond-assign': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-func-assign': 'error',
  'no-global-assign': 'error',
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }]
};

export default [
  {
    files: ['script.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: Object.fromEntries([
        ...browserGlobals.map((name) => [name, 'readonly']),
        ['module', 'writable']
      ])
    },
    rules
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { __dirname: 'readonly' }
    },
    rules
  }
];
