module.exports = {
  root: true,
  env: {
    node: true
  },
  'extends': [
    'plugin:vue/essential',
    '@vue/standard',
    '@vue/typescript/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2020
  },
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-use-before-define': 'off',
    'quotes': ['error', 'single'],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-types': 'off',
    'camelcase': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    'no-unused-expressions': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    'no-cond-assign': 'off',
    'semi': ['error', 'never'],
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-trailing-spaces': 'off'
  }
}
