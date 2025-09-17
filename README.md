# ImmyBot VS Code Extension

This extension allows you to edit ImmyBot scripts from VS Code

## Development

- Run `npm install` in terminal to install dependencies
- Run the `Run Web Extension` target in the Debug View. This will:
  - Start a task `npm: watch` to compile the code
  - Run the extension in a new VS Code window that contains a web extension host

## Linting

This project uses two linters working together:

- `oxlint` (fast Rust-based linter) for broad, fast static analysis.
- `eslint` for TypeScript-specific and ecosystem rules. The `eslint-plugin-oxlint` plugin disables overlapping rules so ESLint only runs the rules oxlint does not cover.

Scripts:

- `npm run lint` runs oxlint (with autofix for safe fixes) then eslint.
- `npm run lint:fix` attempts additional eslint autofixes.
- `npm run lint:ox` runs only oxlint.
- `npm run lint:eslint` runs only eslint.

Configuration:

- `oxlint.config.json` contains oxlint rules and ignore patterns (dist, build, node_modules).
- `.eslintrc.cjs` extends `plugin:oxlint/recommended` plus TypeScript presets; adjust or add overrides as needed.

CI Recommendation: use `npm run lint` in your pipeline.

VS Code Extension Recommendation:

- Install the "Oxc" extension (`oxc.oxc-vscode`) for IDE diagnostics powered by the same engine that backs oxlint.
