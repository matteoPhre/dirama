# Contributing to dirama

Thank you for your interest in contributing to **dirama**! This guide describes how to set up the local environment, the recommended workflow for proposing changes, and the conventions required before a Pull Request can be merged.

## Table of Contents

- [Local environment setup](#local-environment-setup)
- [Workflow for proposing changes](#workflow-for-proposing-changes)
- [Commit conventions](#commit-conventions)
- [Continuous Integration rules](#continuous-integration-rules)

## Local environment setup

### Requirements

- Node.js >= 18 (Node 20 recommended, the same version used by the CI)
- npm (the repository uses `package-lock.json`)

### Steps

1. Fork the repository and clone it locally:

   ```bash
   git clone https://github.com/<your-username>/dirama.git
   cd dirama
   ```

2. Install the dependencies in a reproducible way:

   ```bash
   npm ci
   ```

3. Verify that everything works correctly before starting to work:

   ```bash
   npm run type-check
   npm run lint
   npm test
   npm run build
   ```

## Workflow for proposing changes

1. **Open an Issue** (if one doesn't already exist) describing the bug to fix or the feature to introduce. This allows the approach to be discussed before writing code.
2. **Create a dedicated branch** starting from `main`, with a descriptive name, for example:

   ```bash
   git checkout -b fix/pipeline-exit-flag
   git checkout -b feat/conditional-stage-hooks
   ```

3. **Implement the change**, adding or updating the tests in `tests/` to cover the new behavior.
4. **Run the local checks** (`type-check`, `lint`, `test`, `build`) before opening the Pull Request.
5. **Open a Pull Request** targeting `main`, linking it to the corresponding Issue (e.g. `Closes #12`) and clearly describing what changes and why.
6. Respond to any review requests: the PR is merged only after approval and after all automated checks pass.

## Commit conventions

The project follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). The general format is:

```
<type>(<optional scope>): <short description>
```

Most common types:

- `feat`: a new feature
- `fix`: a bug fix
- `docs`: documentation-only changes
- `refactor`: code changes that neither fix a bug nor add a feature
- `test`: adding or modifying tests
- `chore`: maintenance, dependencies, configuration

Examples:

```
feat(pipeline): add support for exitAfter on individual stages
fix(filter): avoid double resolve when match callback throws
docs(readme): document PipelineFilter usage
```

## Continuous Integration rules

Every Pull Request automatically triggers the GitHub Actions workflow defined in [`.github/workflows/ci.yml`](./.github/workflows/ci.yml), which runs in sequence:

1. Clean dependency installation (`npm ci`)
2. Type-check (`npm run type-check`)
3. Lint (`npm run lint`)
4. Test (`npm test`)
5. Build (`npm run build`)

**All jobs must complete successfully before the Pull Request can be merged into `main`.** If a check fails, fix the issue locally, push the changes to the PR branch, and wait for the CI to run again.
