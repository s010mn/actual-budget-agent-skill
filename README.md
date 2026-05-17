# Actual Budget Agent Skill

Portable Agent Skill for working with Actual Budget through the official Actual CLI.

## What It Does

- Guides agents through safe Actual Budget bookkeeping workflows.
- Uses the official `@actual-app/cli@26.5.2` package.
- Provides a bundled helper script for common tasks and dry-run transaction previews.
- Keeps credentials in environment variables only.

## Requirements

- Node.js 22 or newer
- npm/npx
- Reachable Actual Budget server
- `ACTUAL_SERVER_URL`
- `ACTUAL_SYNC_ID`
- `ACTUAL_PASSWORD` or `ACTUAL_SESSION_TOKEN`

## Usage

From the repository root:

```bash
node actual-budget/scripts/actual-budget.mjs doctor
node actual-budget/scripts/actual-budget.mjs env-help
node actual-budget/scripts/actual-budget.mjs --fresh context --recent-limit 5
```

Preview an expense:

```bash
node actual-budget/scripts/actual-budget.mjs --fresh add-expense --account "Checking" --date 2026-05-17 --amount 12.34 --payee "Coffee Shop" --category "Food"
```

Commit only after reviewing the preview:

```bash
node actual-budget/scripts/actual-budget.mjs --fresh add-expense --account "Checking" --date 2026-05-17 --amount 12.34 --payee "Coffee Shop" --category "Food" --yes
```

Create a missing spending group/category on commit:

```bash
node actual-budget/scripts/actual-budget.mjs --fresh add-expense --account "Huabei" --date 2026-05-17 --amount 42 --payee "McDonald's" --category-group "可裁剪消费" --category "快餐外食" --create-category --yes
```

Use `--data-dir <path>` to reuse one fresh Actual CLI session across multiple commands. Avoid treating old `.actual-cli-data` contents as authoritative after UI edits or sync errors.

## Installation

Copy the `actual-budget/` directory into a compatible agent skill directory, or reference it from an agent runtime that supports Agent Skills.

## Security

Do not store Actual Budget passwords or session tokens in this repository. Use environment variables and avoid committing shell history, `.env` files, or generated logs containing secrets.
