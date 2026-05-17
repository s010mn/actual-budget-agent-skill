---
name: actual-budget
description: Use when working with Actual Budget bookkeeping, transactions, budgets, accounts, categories, payees, rules, schedules, Actual CLI, ActualQL queries, imports, exports, reconciliations, or agent-assisted personal finance workflows.
license: MIT
---

# Actual Budget

Use the official Actual Budget CLI as the source of truth. This skill adds a portable helper script and rules for safe, low-token bookkeeping.

Requires Node.js 22+, npm/npx, network access for the first `@actual-app/cli` download, and a reachable Actual Budget server.

## First Step

Run:

```bash
node actual-budget/scripts/actual-budget.mjs doctor
```

If credentials are missing, ask the user to configure:

- `ACTUAL_SERVER_URL`
- `ACTUAL_SYNC_ID`
- `ACTUAL_PASSWORD` or `ACTUAL_SESSION_TOKEN`

Never write passwords or session tokens to files, logs, config, commits, or shell history examples with real values.

## State Rules

- For state-sensitive work, start one fresh task session: `--fresh context --recent-limit 10`; reuse its returned/printed data dir with `--data-dir <path>` for follow-up calls when needed.
- Do not trust old `.actual-cli-data` caches after UI edits, deletes, or `out-of-sync`; refresh through the helper instead.
- Do not read Actual SQLite/sync files to decide accounts, categories, balances, or transactions.
- Prefer `context` over separate accounts/categories/recent calls.

## Common Commands

Use JSON output for agent parsing.

```bash
node actual-budget/scripts/actual-budget.mjs --fresh context --recent-limit 10
node actual-budget/scripts/actual-budget.mjs --data-dir <path> accounts
node actual-budget/scripts/actual-budget.mjs id --type accounts --name "Checking"
node actual-budget/scripts/actual-budget.mjs --dry-run --fresh actual -- categories list
```

For complete command details, read `references/actual-cli.md` only when needed.

## Write Safety

Preview writes first:

```bash
node actual-budget/scripts/actual-budget.mjs add-expense --account "Checking" --date 2026-05-17 --amount 12.34 --payee "Coffee Shop" --category "Food"
```

For a missing category, preview category creation:

```bash
node actual-budget/scripts/actual-budget.mjs add-expense --account "Huabei" --date 2026-05-17 --amount 42 --payee "McDonald's" --category-group "可裁剪消费" --category "快餐外食" --create-category
```

Only add `--yes` after the user explicitly asks to commit the transaction. After writes, verify with a fresh or same-session read.

## Actual Budget Rules

- Actual CLI input amounts are integer cents. The helper accepts decimal expense amounts and converts them to negative cents.
- For transaction sums or counts, filter split transactions with `is_parent: false`.
- Avoid rapid loops of CLI calls. Prefer one ActualQL query with a date range, then process locally.
- Ask before writing if the date, amount, account, payee, category, transfer intent, or reimbursement status is ambiguous.
- Use table output only for human-facing summaries; keep machine work in JSON.

## Stale Cache / Out-of-Sync

If Actual returns `out-of-sync`, or CLI data contradicts the UI/user, discard the current task session and retry once with `--fresh context`. Do not use stale cache contents as a fallback answer; report the sync issue if fresh reads fail too.

## References

- Official API docs: https://actualbudget.org/docs/api/
- Official CLI docs: https://actualbudget.org/docs/api/cli/
- ActualQL docs: https://actualbudget.org/docs/api/actual-ql/
