const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src/dist/**",
      "*.min.js",
      "build/**",
      ".eb-cache/**", // electron-builder tool cache (fpm/ruby, etc.)
      "src/**", // src has its own config
      "site/assets/site.js", // built from site/src by npm run build:site
    ],
  },
  // Main process files (CommonJS)
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.node,
        ...globals.commonjs,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      // Relaxed rules - catch syntax errors but don't be too strict
      "no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_|^event|^err|^error" },
      ],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-control-regex": "off",
      "no-useless-catch": "off",
      "no-async-promise-executor": "off",
      "prefer-const": "off",
      "no-var": "off",
    },
  },
  // The site's own scripts (site/src): ES modules that run in the browser.
  {
    files: ["site/src/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
  },
];
