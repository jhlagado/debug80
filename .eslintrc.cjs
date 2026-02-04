module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.eslint.json',
  },
  plugins: ['@typescript-eslint', 'jsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // TypeScript strict rules
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/strict-boolean-expressions': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/await-thenable': 'error',
    '@typescript-eslint/no-misused-promises': 'error',

    // Code quality
    'no-console': 'warn',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all'],
    'prefer-const': 'error',
    'no-var': 'error',
  },
  ignorePatterns: ['out/**', 'node_modules/**', '*.js', '**/*.d.ts'],
  overrides: [
    {
      files: [
        'src/extension/extension.ts',
        'src/platforms/cycle-clock.ts',
        'src/platforms/types.ts',
        'src/platforms/simple/runtime.ts',
        'src/platforms/tec1/*.ts',
        'src/platforms/tec1g/*.ts',
      ],
      rules: {
        'jsdoc/require-file-overview': 'error',
        'jsdoc/require-jsdoc': [
          'error',
          {
            require: {
              ClassDeclaration: true,
              FunctionDeclaration: true,
            },
          },
        ],
      },
    },
    {
      files: ['src/test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-floating-promises': 'off',
      },
    },
    {
      files: ['tests/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-floating-promises': 'off',
      },
    },
    {
      files: ['webview/**/*.ts'],
      env: {
        browser: true,
        node: false,
      },
      parserOptions: {
        project: './webview/tsconfig.json',
      },
      rules: {
        '@typescript-eslint/no-unsafe-return': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unnecessary-type-assertion': 'off',
        '@typescript-eslint/strict-boolean-expressions': 'off',
        curly: 'off',
      },
    },
  ],
};
