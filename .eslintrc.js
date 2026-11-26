module.exports = {
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  extends: 'airbnb-base',
  overrides: [
  ],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  rules: {
    // MongoDB names its key _id; the rule would flag every document lookup
    'no-underscore-dangle': ['error', { allow: ['_id'] }],
    // A server: console is how it writes its log (Coolify keeps stdout)
    'no-console': 'off',
  },
};
