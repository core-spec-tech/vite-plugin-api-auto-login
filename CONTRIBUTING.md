# Contributing

Use the Node.js version in `.nvmrc` and npm with the committed lockfile:

```bash
nvm install
nvm use
npm ci
```

## Code conventions

- Use two-space indentation, single quotes, no semicolons, and trailing commas
  in multiline lists. Follow `.editorconfig`, `.prettierrc.json`, and `eslint.config.js`.
- Use `PascalCase` for classes, interfaces, and type aliases; `camelCase` for
  methods, functions, parameters, and variables; and `UPPER_SNAKE_CASE` for
  fixed module-level constants. Do not prefix interfaces with `I`.
- Treat acronyms as words in new identifiers, such as `ApiClient`. Preserve
  existing public names such as `viteAPIAutoLogin` for compatibility.
- Prefer functions for stateless behavior and closures for local stream state. Group
  files by responsibility in lowercase directories. Keep tests in matching
  directories under `tests/`, with a `.spec.ts` suffix.
- Use `@/` for imports from `src/` and relative imports for test helpers.
  Use `import type` for imports used only as types. Published declarations
  must use consumer-resolvable paths; `npm run build` rewrites local aliases.
- Prefer `const` and mark properties `readonly` when they should not change.
  Use `unknown` and narrow it at external boundaries instead of using `any`.
- Declare parameter and return types on exported functions and public methods.
  Let TypeScript infer obvious local types.
- Use type aliases for function contracts such as `AuthRequest`, unions, and
  composed data shapes. Use interfaces when an object contract benefits from extension.

Prettier owns formatting, with a 100-character print width. ESLint also checks
a 100-character maximum line length in code, except lines containing URLs,
strings, template literals, or regular expressions that cannot reliably be wrapped.
Short single-line ternaries are allowed; use `if`/`else` for multiline conditions
or branches. A local ESLint rule enforces this for ternary expressions.

## Design

Keep classes focused on one responsibility. Prefer composition and injected
dependencies; introduce inheritance only when the subtype genuinely satisfies
the parent contract. Small pure helpers do not need a class wrapper.

Keep configuration defaults and environment conversion in `loadPluginConfig`.
Validate strategy-specific requirements in the strategy that needs them. The
default `createFormDataRequest` requires login credentials; a custom strategy may
use a different authentication mechanism.

Reuse Vite APIs for environment loading, plugin lifecycle, middleware registration,
and logging. Keep authentication state scoped to its server session. Consolidate
shared behavior when it has the same responsibility, without coupling unrelated
features merely because their code looks similar.

Write documentation, comments, and error messages in English. Update the README
when changing public options or behavior, and avoid breaking exported APIs without
an explicit compatibility decision.

## Checks and tests

Before submitting a change, run:

```bash
npm run check
npm run build
```

`check` runs Prettier validation, ESLint, the full TypeScript check, and all tests. `build` produces
ESM, CommonJS, and declarations. Use `npm test` for watch mode, `npm run coverage`
for coverage, `npm run format` to format files, and `npm run lint:fix` for fixable lint findings.
Prettier runs separately from ESLint; `eslint-config-prettier` disables competing
formatting rules.

ESLint applies the TypeScript recommended type-checked rules to TypeScript files,
including checks for floating promises, misused promises, unsafe assignments,
and unsafe calls. Type-only imports are required, and explicit module boundary
types are required in `src/`. Vitest's recommended checks apply to test files;
its `unbound-method` rule replaces the TypeScript rule there so mock assertions
are understood while unsafe method references are still checked.

Test observable behavior and failure paths when changing functionality. Await
asynchronous hooks and assertions. Give mocks meaningful types when inspecting
their arguments or results; avoid suppressing safety checks to accommodate a mock.
Keep shared test fixtures in `tests/helpers`.

Include the problem, resulting behavior, and validation results in pull requests.
Never commit real credentials or tokens; use local environment overrides for
development secrets.

## Security checks

Run `npm run security:audit` to check the lockfile against npm advisories,
including development dependencies. It requires network access but does not
install packages or run their lifecycle scripts. High and critical findings fail
the command; lower-severity findings are still printed and should be triaged.
The publishing workflow runs the same check before publishing.

The Security workflow runs on pull requests, pushes to `main`, every Monday
at 06:23 UTC, and manual dispatch. It provides:

- A full lockfile audit, including newly disclosed vulnerabilities in unchanged dependencies.
- Dependency review for newly introduced vulnerabilities on pull requests.
- CodeQL `security-extended` analysis of JavaScript/TypeScript and GitHub Actions.

Actions are pinned to full commit IDs. Renovate proposes updates to those pins
for review. Workflow permissions are read-only except for CodeQL's permission
to upload security findings. Pull requests use `pull_request`, not the
privileged `pull_request_target` event.

### Temporary dependency override

`package.json` overrides `minimatch@^10.0.0` with `^11.0.5` to address
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
ESLint and typescript-eslint still request the affected v10 series. This override
crosses a major version boundary, so validate lint file discovery, the full project
checks, and builds when updating it. It does not change the separate v3 dependency
used by release tooling.

Remove the override once the upstream lint packages resolve a patched version
without it, and confirm a fresh install and `npm audit --include=dev` remain clean.

### GitHub setup

In the [GitHub repository](https://github.com/core-spec-tech/vite-plugin-api-auto-login):

1. Enable Dependabot alerts, secret scanning, push protection, and private
   vulnerability reporting in repository settings. Renovate handles dependency
   update PRs; a second version-update bot is unnecessary.
2. Use the checked-in CodeQL workflow as advanced setup; do not also enable
   CodeQL default setup. CodeQL and dependency review require appropriate GitHub
   Code Security entitlement if the repository is private.
3. Require the CI check, Dependency audit, and Dependency review checks on the
   default branch. Also configure a code scanning merge-protection rule for
   CodeQL high/critical findings. A successful analysis job alone does not mean
   CodeQL found no vulnerabilities.
4. Require review for workflow and release changes. Keep the protected branch
   name and the Security workflow's push filter aligned if it is not `main`.

Workflow files cannot enable repository-level secret scanning or merge rules.
Those settings must be configured on GitHub. Scheduled scans begin after the
workflow is on the default branch.

References: [GitHub Actions security](https://docs.github.com/en/actions/reference/security/secure-use),
[code scanning merge protection](https://docs.github.com/en/code-security/concepts/code-scanning/merge-protection),
and [repository security settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-security-and-analysis-settings-for-your-repository).

## Versioning and releases

This project starts at `0.1.0` and uses [Semantic Versioning](https://semver.org/)
through `commit-and-tag-version`. Use Conventional Commits:

- `fix: ...` for bug fixes.
- `feat: ...` for features.
- `feat!: ...` or a `BREAKING CHANGE:` footer for incompatible changes.
- `docs:`, `test:`, `refactor:`, and `chore:` for other changes.

During `0.x` development, automatic releases use patch bumps for fixes and
non-breaking features, and minor bumps for breaking changes. Use
`npm run release:major` when the public API is ready for `1.0.0`.
From `1.0.0`, automatic releases use patch/minor/major for fixes/features/breaking
changes respectively.

Run checks from a clean Git checkout before preparing a release:

```bash
npm run check
npm run example:build
npm run security:audit
```

Use `npm run release` to determine the version from commits, or choose an explicit bump:

| Command                 | Example starting from 0.2.0 |
| ----------------------- | --------------------------- |
| `npm run release:patch` | `0.2.1`                     |
| `npm run release:minor` | `0.3.0`                     |
| `npm run release:major` | `1.0.0`                     |

These commands update `package.json`, `package-lock.json`, and `CHANGELOG.md`,
then create a release commit and annotated tag. They do not push or publish.
Preview with `-- --dry-run`, for example `npm run release:patch -- --dry-run`.
Review the generated version and changelog before pushing. `release:first` is
only for bootstrapping a new project; do not use it for this already-published package.

### Publish to npm

1. Store a granular stage-only token with publishing access to the `@corespec`
   scope in the repository Actions secret `NPM_TOKEN`. Local tokens belong in the
   ignored `.env` file, never in Git.
2. Prepare and verify the release as described above.
3. Push the release commit and tag with `git push --follow-tags`.
4. Wait for the Publish workflow to finish. It installs dependencies, audits them,
   runs all checks, builds, and runs `npm stage publish --access public --provenance`.
5. After npm's automated review completes, approve the staged version in npm's
   Staged Packages tab with 2FA, or run:

   ```bash
   nvm use
   npm login
   npm stage approve <stage-id-from-workflow>
   ```

6. Verify publication with `npm view @corespec/vite-plugin-api-auto-login version`.
   Staging success alone does not mean the version is publicly available.

If npm returns HTTP 409 because review is pending, wait a few minutes and retry
approval with the same stage ID. Do not upload another copy. If `npm stage` is
unknown, use the Node/npm version pinned in `.nvmrc` with `nvm use`.

The workflow accepts `v*` and `@corespec/vite-plugin-api-auto-login@*` tags and
validates the tag against `package.json`. To retry a failed workflow for an
existing tag, run Publish manually with that tag as input. Historical tags were
removed during the Git history reset; published npm versions remain available.

Trusted publishing can replace token authentication after configuring the npm
package for owner `core-spec-tech`, repository `vite-plugin-api-auto-login`, and
workflow `publish.yml`. Update the workflow authentication and remove the token
secret only after that setup. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Source imports and local linking

Use `@/` for imports from `src/`, including in tests. TypeScript and Vite/Vitest
resolve the alias locally; the declaration build rewrites it to relative paths.
Consumers do not need an alias configuration.

Build before linking a checkout into a consuming application:

```bash
# In this repository
npm run build
npm link

# In your application
npm link @corespec/vite-plugin-api-auto-login
```

Rebuild after changing library source. The linked package resolves its compiled
files in `dist`, not the TypeScript source.
