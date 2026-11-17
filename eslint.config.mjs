import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'api/_server.mjs'],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
