# Contributing

Thanks for your interest in improving the Network Planning & Design Tool. This document describes the workflow, conventions, and quality gates for contributions.

## Getting Started

```bash
git clone https://github.com/dicesoft/Network-Planning-and-Design-Tool.git
cd Network-Planning-and-Design-Tool
npm install
npm run dev          # http://localhost:3000
```

Node 18+ is required.

## Branching

- Default branch: **`dev`**. All work merges into `dev` first.
- `master` only receives fast-forward merges from `dev` for releases.
- Use descriptive branch names: `feature/short-name`, `fix/short-name`, `docs/short-name`.

## Quality Gates

Before opening a PR, every change must pass:

```bash
npm run lint:strict   # ESLint, zero warnings
npm run test:run      # Vitest unit suite
npm run test:e2e      # Puppeteer E2E suite
npm run build         # tsc + vite production build
npm run test:bundle   # No console.log / debugger in dist
```

The repo also exposes a `/gate-check` command in Claude Code that bundles these.

## Engineering Principles

Key non-negotiables:

- **Modular & moddable** — extend via registration patterns; do not edit central switch statements.
- **JSON config** — user-facing settings/libraries/profiles must be JSON with versioned schemas; no secrets in JSON.
- **Async-first** — long work must not block the UI. Respect the 2.1 MB bundle and 60 fps budgets.
- **Security by default** — validate all imports and URL params; never execute user data.
- **Deployment matrix** — every change must still run under `npm run dev`, static prod build, Docker, and Cloud Run without source forks.

## Code Style

- TypeScript strict, no `any` without justification.
- Tailwind classnames are auto-ordered by `eslint-plugin-tailwindcss`.
- Prefer functional, immutable patterns. Stores use Zustand with `immer`.
- New UI features need a `data-testid` and a corresponding E2E test.

## Pull Requests

1. Push your feature branch and open a PR against `dev`.
2. Fill the PR description: summary, screenshots/GIFs for UI changes, test plan.
3. Ensure CI is green; address review comments by pushing follow-up commits (avoid force-push during review).
4. A maintainer will squash-merge once approved.

## Reporting Issues

Use the issue tracker with reproduction steps, expected vs. actual, and a topology JSON export when relevant. For security issues, email the maintainer directly rather than filing a public issue.
