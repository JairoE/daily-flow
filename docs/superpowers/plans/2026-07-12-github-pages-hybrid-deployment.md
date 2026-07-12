# GitHub Pages Hybrid Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically mirror each successful `main` web build to `gh-pages` and deploy the same build directly through GitHub Pages.

**Architecture:** A single GitHub Actions workflow validates and exports the Expo app once in a `build` job. That job pushes `dist` to `gh-pages` and uploads it as the official Pages artifact; a dependent `deploy` job publishes the artifact through the `github-pages` environment.

**Tech Stack:** GitHub Actions, Node.js 22, npm, Expo SDK 57, `gh-pages`, GitHub Pages artifact actions

## Global Constraints

- Trigger deployments only for pushes to `main` and manual `workflow_dispatch` runs.
- Keep `app.json` and the existing `/daily-flow` Expo base URL unchanged.
- Use only the repository-provided `GITHUB_TOKEN`; require no added secrets.
- Publish one generated `dist` directory to both `gh-pages` and direct Pages deployment.
- Stop before direct deployment if install, validation, test, export, branch mirror, or artifact upload fails.
- Keep the repository Pages source set to GitHub Actions.

---

### Task 1: Add And Verify The Hybrid Pages Workflow

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `src/__tests__/deployPagesWorkflow.test.ts`

**Interfaces:**
- Consumes: `package-lock.json`, npm scripts `typecheck`, `test`, and `predeploy`, Expo output directory `dist`, repository `GITHUB_TOKEN`.
- Produces: an updated `gh-pages` branch and a deployable `github-pages` artifact for every successful `main` run.

- [x] **Step 1: Write the failing workflow-contract test**

```typescript
/// <reference types="node" />

import { readFileSync } from 'node:fs';
import path from 'node:path';

const workflowPath = path.resolve(
  __dirname,
  '../../.github/workflows/deploy-pages.yml',
);

describe('GitHub Pages deployment workflow', () => {
  it('mirrors the Expo build to gh-pages and deploys the same Pages artifact', () => {
    const workflow = readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run predeploy');
    expect(workflow).toContain('npx gh-pages');
    expect(workflow).toContain('actions/upload-pages-artifact@v4');
    expect(workflow).toContain('actions/deploy-pages@v4');
    expect(workflow).toContain('needs: build');
  });
});
```

- [x] **Step 2: Run the focused test and verify the expected failure**

Run: `npx jest --runInBand src/__tests__/deployPagesWorkflow.test.ts`

Expected: FAIL because `.github/workflows/deploy-pages.yml` does not exist.

- [x] **Step 3: Add the minimal hybrid deployment workflow**

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: github-pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v6

      - name: Set up Node.js
        uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Typecheck
        run: npm run typecheck

      - name: Test
        run: npm test

      - name: Export Expo web app
        run: npm run predeploy

      - name: Mirror build to gh-pages
        run: |
          git remote set-url origin https://git:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git
          npx gh-pages --nojekyll --silent -d dist -u "github-actions-bot <support+actions@github.com>" -m "Deploy ${GITHUB_SHA}"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Configure GitHub Pages
        uses: actions/configure-pages@v5

      - name: Upload GitHub Pages artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [x] **Step 4: Run the focused test and verify it passes**

Run: `npx jest --runInBand src/__tests__/deployPagesWorkflow.test.ts`

Expected: PASS with one test passing.

- [x] **Step 5: Validate workflow syntax and generated site output**

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm test`

Expected: all Jest suites pass.

Run: `npm run predeploy`

Expected: exit 0 and Expo reports a successful web export to `dist`.

Run: `test -f dist/index.html && test -d dist/_expo/static/js/web`

Expected: exit 0, confirming the GitHub Pages artifact contains the entry point and compiled web bundle.

- [x] **Step 6: Commit the workflow implementation**

```bash
git add .github/workflows/deploy-pages.yml src/__tests__/deployPagesWorkflow.test.ts docs/superpowers/plans/2026-07-12-github-pages-hybrid-deployment.md
git commit -m "Add hybrid GitHub Pages deployment"
```
