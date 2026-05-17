# Actual CLI Reference

Use this reference when the helper script is not enough and direct Actual CLI access is needed.

## Official CLI

All direct calls should use the pinned CLI:

```bash
npx -y @actual-app/cli@26.5.2 --format json <command>
```

Required environment variables:

- `ACTUAL_SERVER_URL`
- `ACTUAL_SYNC_ID`
- `ACTUAL_PASSWORD` or `ACTUAL_SESSION_TOKEN`

Optional:

- `ACTUAL_DATA_DIR`
- `ACTUAL_ENCRYPTION_PASSWORD`

The helper also accepts global session flags:

```bash
node actual-budget/scripts/actual-budget.mjs --fresh context --recent-limit 10
node actual-budget/scripts/actual-budget.mjs --data-dir <path> accounts
node actual-budget/scripts/actual-budget.mjs --dry-run --fresh actual -- categories list
```

Use `--fresh` when UI changes, deletes, or sync errors may make an old CLI cache stale. Use `--data-dir <path>` to reuse one fresh session for follow-up calls in the same task.

## Safe Setup Examples

PowerShell:

```powershell
$env:ACTUAL_SERVER_URL="http://your-actual-server:5006"
$env:ACTUAL_SYNC_ID="your-budget-sync-id"
$env:ACTUAL_SESSION_TOKEN="your-session-token"
```

cmd.exe:

```bat
set ACTUAL_SERVER_URL=http://your-actual-server:5006
set ACTUAL_SYNC_ID=your-budget-sync-id
set ACTUAL_SESSION_TOKEN=your-session-token
```

bash/zsh:

```bash
export ACTUAL_SERVER_URL="http://your-actual-server:5006"
export ACTUAL_SYNC_ID="your-budget-sync-id"
export ACTUAL_SESSION_TOKEN="your-session-token"
```

## Common Operations

```bash
npx -y @actual-app/cli@26.5.2 --format json accounts list
npx -y @actual-app/cli@26.5.2 --format json categories list
npx -y @actual-app/cli@26.5.2 --format json payees list
npx -y @actual-app/cli@26.5.2 --format json server get-id --type accounts --name "Checking"
npx -y @actual-app/cli@26.5.2 --format json query run --last 10
```

Prefer the helper's context snapshot for agent work:

```bash
node actual-budget/scripts/actual-budget.mjs --fresh context --recent-limit 10
```

Add a transaction only after previewing intent:

```bash
npx -y @actual-app/cli@26.5.2 --format json transactions add --account <id> --data '[{"date":"2026-05-17","amount":-1234,"payee_name":"Coffee Shop"}]'
```

Preview category creation with an expense:

```bash
node actual-budget/scripts/actual-budget.mjs --fresh add-expense --account "Huabei" --date 2026-05-17 --amount 42 --payee "McDonald's" --category-group "可裁剪消费" --category "快餐外食" --create-category
```

## ActualQL Notes

Useful query pattern for transactions:

```bash
npx -y @actual-app/cli@26.5.2 --format json query run --table transactions --select "date,amount,payee.name,category.name,account.name,is_parent" --filter '{"is_parent":false}' --order-by "date:desc" --limit 50
```

Avoid one CLI call per month or per category. Fetch a wider date range once and aggregate locally.

## Pitfalls

- Input amounts are raw integer cents. Expenses are negative.
- JSON output keeps raw cents; table and CSV may format amounts as decimals.
- Split parents can double-count totals unless `is_parent: false` is applied.
- The official CLI is experimental; pin the version and verify after upgrades.
- Do not inspect Actual SQLite/sync files as source of truth; use fresh CLI/API reads.
- If `out-of-sync` appears, retry once with `--fresh context`; do not answer from stale `.actual-cli-data`.
