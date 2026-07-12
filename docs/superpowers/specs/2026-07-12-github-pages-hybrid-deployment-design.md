# GitHub Pages Hybrid Deployment Design

## Goal

Deploy the Expo web build after every merge to `main` while preserving the
existing `gh-pages` branch as a mirror of the published static files.

## Architecture

Add one workflow at `.github/workflows/deploy-pages.yml`. It runs on pushes to
`main` and through `workflow_dispatch`, and uses a concurrency group so only one
Pages deployment can proceed at a time.

The workflow has two jobs:

1. `build` checks out the merge commit, installs locked dependencies with Node
   22, runs type checking and tests, exports the Expo web app once, publishes
   that `dist` directory to `gh-pages`, and uploads the same directory as the
   GitHub Pages artifact.
2. `deploy` waits for `build`, then publishes the uploaded artifact with the
   official Pages deployment action and records the deployment URL in the
   `github-pages` environment.

## Authentication And Permissions

The workflow uses the repository-provided `GITHUB_TOKEN`. Checkout retains its
credentials so the installed `gh-pages` package can push the generated files to
the `gh-pages` branch. Workflow permissions are limited to `contents: write`,
`pages: write`, and `id-token: write`.

The live site does not depend on the `gh-pages` push triggering another
workflow. Direct artifact deployment is authoritative; the branch is retained
as an inspectable mirror and manual fallback.

## Build And Publish Flow

The `build` job runs these steps in order:

1. Check out the triggering `main` commit.
2. Set up Node 22 with npm caching.
3. Run `npm ci`.
4. Run `npm run typecheck`.
5. Run `npm test`.
6. Run `npm run predeploy`, producing `dist` with the existing `/daily-flow`
   base URL.
7. Run the local `gh-pages` CLI against `dist` with Jekyll disabled.
8. Configure Pages and upload `dist` as the Pages artifact.

The `deploy` job runs only after all build and branch-mirror steps succeed. It
uses `actions/deploy-pages` in the `github-pages` environment.

## Failure Behavior

Dependency, validation, test, export, branch push, or artifact upload failures
stop the workflow before the live deployment. This prevents `gh-pages` and the
live site from knowingly representing different builds.

The workflow requires the repository Pages source to remain set to GitHub
Actions. No personal access token or additional repository secret is required.

## Scope

The change adds the workflow and supporting documentation only. It does not
change application code, the existing Expo `baseUrl`, or the manual
`predeploy`/`deploy` scripts.

## Verification

Before publishing the workflow change:

- Parse and lint the workflow YAML when the local toolchain supports it.
- Run `npm run typecheck` and `npm test`.
- Run `npm run predeploy` and confirm the expected `dist` output exists.
- Inspect the workflow diff for the `main` trigger, permissions, concurrency,
  `gh-pages` mirror step, Pages artifact upload, and dependent deploy job.

After the workflow reaches `main`, verify the Actions run updates both the
`gh-pages` branch and the `github-pages` environment deployment.
