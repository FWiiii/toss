import antfu from '@antfu/eslint-config'

export default antfu({
  gitignore: true,
  ignores: [
    '.codex',
    '.superpowers',
  ],
  nextjs: true,
  react: true,
  stylistic: true,
  typescript: true,
}, {
  rules: {
    'node/prefer-global/process': 'off',
    'react-refresh/only-export-components': 'off',
  },
})
