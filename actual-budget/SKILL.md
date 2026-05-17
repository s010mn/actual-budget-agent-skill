---
name: actual-budget
description: Use when working with Actual Budget bookkeeping, transactions, budgets, accounts, categories, payees, rules, schedules, Actual CLI, ActualQL queries, imports, exports, reconciliations, or agent-assisted personal finance workflows.
license: MIT
---

# Actual Budget

Use the official Actual Budget CLI as the source of truth. This skill adds a portable helper script and rules for safe agent bookkeeping.

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

## Common Commands

Use JSON output for agent parsing.

```bash
node actual-budget/scripts/actual-budget.mjs accounts
node actual-budget/scripts/actual-budget.mjs categories
node actual-budget/scripts/actual-budget.mjs payees
node actual-budget/scripts/actual-budget.mjs recent --limit 10
node actual-budget/scripts/actual-budget.mjs id --type accounts --name "Checking"
node actual-budget/scripts/actual-budget.mjs actual -- query run --last 5
```

For complete command details, read `references/actual-cli.md` only when needed.

## Write Safety

Preview writes first:

```bash
node actual-budget/scripts/actual-budget.mjs add-expense --account "Checking" --date 2026-05-17 --amount 12.34 --payee "Coffee Shop" --category "Food"
```

Only add `--yes` after the user explicitly asks to commit the transaction.

## Actual Budget Rules

- Actual CLI input amounts are integer cents. The helper accepts decimal expense amounts and converts them to negative cents.
- For transaction sums or counts, filter split transactions with `is_parent: false`.
- Avoid rapid loops of CLI calls. Prefer one ActualQL query with a date range, then process locally.
- Ask before writing if the date, amount, account, payee, category, transfer intent, or reimbursement status is ambiguous.
- Use table output only for human-facing summaries; keep machine work in JSON.

## References

- Official API docs: https://actualbudget.org/docs/api/
- Official CLI docs: https://actualbudget.org/docs/api/cli/
- ActualQL docs: https://actualbudget.org/docs/api/actual-ql/
