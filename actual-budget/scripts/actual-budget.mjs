#!/usr/bin/env node

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const CLI_PACKAGE = '@actual-app/cli@26.5.2';
const REQUIRED_NODE_MAJOR = 22;
const NPX_EXECUTABLE = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const ENTITY_TYPES = new Set(['accounts', 'categories', 'payees', 'schedules']);

function printHelp() {
  console.log(`Actual Budget agent helper

Usage:
  node actual-budget/scripts/actual-budget.mjs [--dry-run] [--fresh|--data-dir <path>] <command> [options]

Commands:
  doctor                         Check Node, npx, and Actual env vars
  env-help                       Print environment variable setup examples
  actual -- <args>               Pass through to official Actual CLI
  context --recent-limit <n>     Fetch accounts, categories, groups, and recent transactions
  accounts                       List accounts as JSON
  categories                     List categories as JSON
  payees                         List payees as JSON
  id --type <type> --name <name> Resolve accounts/categories/payees/schedules IDs
  recent --limit <n>             Show recent transactions
  add-expense [options]          Preview or add an expense transaction

add-expense options:
  --account <id-or-name>         Required
  --date <YYYY-MM-DD>            Required
  --amount <decimal>             Required, positive expense amount
  --payee <name>                 Required
  --category <id-or-name>        Optional
  --category-group <name>        Optional, used with --create-category
  --create-category              Create category group/category if missing on write
  --notes <text>                 Optional
  --yes                          Actually write; default is dry-run preview
`);
}

function envHelp() {
  return `Configure Actual Budget credentials with environment variables.

Required:
  ACTUAL_SERVER_URL
  ACTUAL_SYNC_ID
  ACTUAL_PASSWORD or ACTUAL_SESSION_TOKEN

PowerShell:
  $env:ACTUAL_SERVER_URL="http://your-actual-server:5006"
  $env:ACTUAL_SYNC_ID="your-budget-sync-id"
  $env:ACTUAL_SESSION_TOKEN="your-session-token"

cmd.exe:
  set ACTUAL_SERVER_URL=http://your-actual-server:5006
  set ACTUAL_SYNC_ID=your-budget-sync-id
  set ACTUAL_SESSION_TOKEN=your-session-token

bash/zsh:
  export ACTUAL_SERVER_URL="http://your-actual-server:5006"
  export ACTUAL_SYNC_ID="your-budget-sync-id"
  export ACTUAL_SESSION_TOKEN="your-session-token"

Do not commit passwords, session tokens, .env files, or shell history containing secrets.
`;
}

function parseArgs(argv) {
  const args = [...argv];
  let dryRun = false;
  let fresh = false;
  let dataDir;

  while (args.length > 0) {
    if (args[0] === '--dry-run') {
      dryRun = true;
      args.shift();
      continue;
    }

    if (args[0] === '--fresh') {
      fresh = true;
      args.shift();
      continue;
    }

    if (args[0] === '--data-dir') {
      args.shift();
      dataDir = args.shift();
      if (!dataDir) throw new Error('Missing value for --data-dir');
      continue;
    }

    break;
  }

  if (fresh && dataDir) {
    throw new Error('Use only one of --fresh or --data-dir.');
  }

  const command = args.shift();
  return { dryRun, fresh, dataDir, command, args };
}

function parseOptions(args) {
  const options = {};
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }

    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const key = arg.slice(2);
    if (key === 'yes') {
      options.yes = true;
      continue;
    }

    if (key === 'create-category') {
      options.createCategory = true;
      continue;
    }

    const value = args[i + 1];
    if (value == null || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    i += 1;
  }

  return { options, positionals };
}

function redacted(value) {
  return value ? '<redacted>' : value;
}

function taskDataDir({ fresh = false, dataDir, redactSecrets = false } = {}) {
  if (dataDir) return dataDir;
  if (!fresh) return undefined;
  if (redactSecrets) return '<temp>';
  return mkdtempSync(join(tmpdir(), 'actual-agent-'));
}

function resolveSession({ fresh = false, dataDir, dryRun = false } = {}) {
  if (fresh && dryRun) return { fresh, dataDir: '<temp>' };
  if (fresh) return { fresh, dataDir: taskDataDir({ fresh }) };
  return { fresh, dataDir };
}

function envConfig({ redactSecrets = false, fresh = false, dataDir } = {}) {
  const password = process.env.ACTUAL_PASSWORD;
  const sessionToken = process.env.ACTUAL_SESSION_TOKEN;

  return {
    serverUrl: process.env.ACTUAL_SERVER_URL,
    syncId: process.env.ACTUAL_SYNC_ID,
    password: redactSecrets ? redacted(password) : password,
    sessionToken: redactSecrets ? redacted(sessionToken) : sessionToken,
    dataDir: taskDataDir({ fresh, dataDir, redactSecrets }),
  };
}

function missingConfig() {
  const config = envConfig();
  const missing = [];

  if (!config.serverUrl) missing.push('ACTUAL_SERVER_URL');
  if (!config.syncId) missing.push('ACTUAL_SYNC_ID');
  if (!config.password && !config.sessionToken) {
    missing.push('ACTUAL_PASSWORD or ACTUAL_SESSION_TOKEN');
  }

  return missing;
}

function nodeMajor() {
  return Number.parseInt(process.versions.node.split('.')[0], 10);
}

function actualBaseArgs({ redactSecrets = false, fresh = false, dataDir } = {}) {
  const config = envConfig({ redactSecrets, fresh, dataDir });
  const args = ['-y', CLI_PACKAGE];

  if (config.serverUrl) args.push('--server-url', config.serverUrl);
  if (config.password) args.push('--password', config.password);
  if (config.sessionToken) args.push('--session-token', config.sessionToken);
  if (config.syncId) args.push('--sync-id', config.syncId);
  if (config.dataDir) args.push('--data-dir', config.dataDir);
  args.push('--format', 'json');

  return args;
}

function actualCommand(args, { redactSecrets = false, fresh = false, dataDir } = {}) {
  return [NPX_EXECUTABLE, ...actualBaseArgs({ redactSecrets, fresh, dataDir }), ...args];
}

function commandForSpawn(command, args) {
  if (process.platform !== 'win32' || !command.endsWith('.cmd')) {
    return { command, args };
  }

  return { command: 'cmd.exe', args: ['/d', '/s', '/c', command, ...args] };
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const spawnTarget = commandForSpawn(command, args);
    const child = spawn(spawnTarget.command, spawnTarget.args, {
      stdio: 'inherit',
      shell: false,
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', (error) => {
      console.error(error.message);
      resolve(1);
    });
  });
}

function runCapture(command, args) {
  const spawnTarget = commandForSpawn(command, args);
  const result = spawnSync(spawnTarget.command, spawnTarget.args, {
    encoding: 'utf8',
    shell: false,
  });

  if (result.error) {
    return { ok: false, stdout: '', stderr: result.error.message, status: 1 };
  }

  return {
    ok: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status ?? 1,
  };
}

function outputJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function ensureEnvForWritePreview() {
  const missing = missingConfig();
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}\n\n${envHelp()}`);
  }
}

function ensureEntityType(type) {
  if (!ENTITY_TYPES.has(type)) {
    throw new Error(`Invalid --type "${type}". Expected one of: ${[...ENTITY_TYPES].join(', ')}`);
  }
}

function looksLikeId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Date must use YYYY-MM-DD format.');
  }

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Date must be a valid YYYY-MM-DD date.');
  }
}

function amountToExpenseCents(amountText) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(amountText)) {
    throw new Error('Amount must be a positive decimal with at most two fractional digits.');
  }

  const [whole, fraction = ''] = amountText.split('.');
  const cents = Number.parseInt(whole, 10) * 100 + Number.parseInt(fraction.padEnd(2, '0'), 10);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error('Amount must be greater than 0.');
  }

  return -cents;
}

function getId(type, name, session = {}) {
  const command = actualCommand(['server', 'get-id', '--type', type, '--name', name], session);
  const result = runCapture(command[0], command.slice(1));
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || `Failed to resolve ${type} "${name}"`);
  }

  const trimmed = result.stdout.trim();
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed.id === 'string') return parsed.id;
  } catch {
    return trimmed.replace(/^"|"$/g, '');
  }

  return trimmed;
}

function parseJsonOutput(result, fallbackMessage) {
  if (!result.ok) {
    throw new Error(result.stderr || result.stdout || fallbackMessage);
  }

  const trimmed = result.stdout.trim();
  return trimmed ? JSON.parse(trimmed) : null;
}

function runActualJson(args, session = {}) {
  const command = actualCommand(args, session);
  const result = runCapture(command[0], command.slice(1));
  return parseJsonOutput(result, `Actual CLI failed: ${args.join(' ')}`);
}

function firstArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.value)) return value.value;
  return [];
}

function findCategoryGroup(groups, name) {
  return firstArray(groups).find((group) => group.name === name);
}

function findCategory(categories, { name, groupId }) {
  return firstArray(categories).find((category) => {
    if (category.name !== name) return false;
    return groupId ? category.group_id === groupId : true;
  });
}

function ensureCategory({ categoryName, categoryGroupName, session }) {
  if (!categoryName || looksLikeId(categoryName)) {
    return { category: categoryName, categoryGroup: undefined, created: [] };
  }

  const created = [];
  let group;
  if (categoryGroupName) {
    const groups = runActualJson(['category-groups', 'list'], session);
    group = findCategoryGroup(groups, categoryGroupName);
    if (!group) {
      group = runActualJson(['category-groups', 'create', '--name', categoryGroupName], session);
      created.push({ type: 'category-groups', name: categoryGroupName, id: group.id });
    }
  }

  const categories = runActualJson(['categories', 'list'], session);
  let category = findCategory(categories, { name: categoryName, groupId: group?.id });
  if (!category) {
    if (!group?.id) {
      throw new Error('--create-category requires --category-group when category is missing.');
    }
    category = runActualJson(['categories', 'create', '--name', categoryName, '--group-id', group.id], session);
    created.push({ type: 'categories', name: categoryName, id: category.id, groupId: group.id });
  }

  return { category: category.id, categoryGroup: group, created };
}

function buildAddExpense(args, { redactSecrets = false, resolveNames = false, fresh = false, dataDir } = {}) {
  const { options } = parseOptions(args);
  for (const key of ['account', 'date', 'amount', 'payee']) {
    if (!options[key]) throw new Error(`Missing required --${key}`);
  }

  validateDate(options.date);
  const amount = amountToExpenseCents(options.amount);

  let account = options.account;
  let category = options.category;
  const resolve = {};
  const created = [];
  const session = { redactSecrets, fresh, dataDir };

  if (looksLikeId(account)) {
    resolve.account = { type: 'accounts', id: account };
  } else {
    resolve.account = { type: 'accounts', name: account };
    if (resolveNames) account = getId('accounts', account, session);
  }

  if (category) {
    if (looksLikeId(category)) {
      resolve.category = { type: 'categories', id: category };
    } else {
      if (options['category-group']) {
        resolve.categoryGroup = {
          type: 'category-groups',
          name: options['category-group'],
          createIfMissing: Boolean(options.createCategory),
        };
      }
      resolve.category = {
        type: 'categories',
        name: category,
        ...(options['category-group'] ? { groupName: options['category-group'] } : {}),
        ...(options.createCategory ? { createIfMissing: true } : {}),
      };
      if (resolveNames) {
        if (options.createCategory) {
          const ensured = ensureCategory({
            categoryName: category,
            categoryGroupName: options['category-group'],
            session,
          });
          category = ensured.category;
          created.push(...ensured.created);
        } else {
          category = getId('categories', category, session);
        }
      }
    }
  }

  const transaction = {
    date: options.date,
    amount,
    payee_name: options.payee,
  };
  if (category) transaction.category = category;
  if (options.notes) transaction.notes = options.notes;

  const actualArgs = [
    'transactions',
    'add',
    '--account',
    account,
    '--data',
    JSON.stringify([transaction]),
  ];

  return {
    yes: options.yes === true,
    resolve,
    created,
    transaction,
    command: actualCommand(actualArgs, { redactSecrets, fresh, dataDir }),
    actualArgs,
  };
}

function contextCommands({ recentLimit, redactSecrets, fresh, dataDir }) {
  return [
    actualCommand(['accounts', 'list'], { redactSecrets, fresh, dataDir }),
    actualCommand(['categories', 'list'], { redactSecrets, fresh, dataDir }),
    actualCommand(['category-groups', 'list'], { redactSecrets, fresh, dataDir }),
    actualCommand(['query', 'run', '--last', recentLimit], { redactSecrets, fresh, dataDir }),
  ];
}

function contextDryRun(args, session) {
  const { options } = parseOptions(args);
  const recentLimit = options['recent-limit'] ?? '10';
  if (!/^\d+$/.test(recentLimit) || Number.parseInt(recentLimit, 10) < 1) {
    throw new Error('--recent-limit must be a positive integer');
  }

  return {
    dryRun: true,
    recentLimit,
    dataDir: session.dataDir,
    fresh: session.fresh,
    commands: contextCommands({ ...session, recentLimit, redactSecrets: true }),
  };
}

function fetchContext(args, session) {
  const { options } = parseOptions(args);
  const recentLimit = options['recent-limit'] ?? '10';
  if (!/^\d+$/.test(recentLimit) || Number.parseInt(recentLimit, 10) < 1) {
    throw new Error('--recent-limit must be a positive integer');
  }

  return {
    dataDir: session.dataDir,
    fresh: session.fresh,
    accounts: runActualJson(['accounts', 'list'], session),
    categories: runActualJson(['categories', 'list'], session),
    categoryGroups: runActualJson(['category-groups', 'list'], session),
    recent: runActualJson(['query', 'run', '--last', recentLimit], session),
  };
}

function verifyTransaction({ accountName, payeeName, amount, categoryName, session }) {
  const recent = firstArray(runActualJson(['query', 'run', '--last', '20'], session));
  return recent.find((transaction) => {
    if (!looksLikeId(accountName) && transaction['account.name'] !== accountName && transaction.account !== accountName) return false;
    if (transaction['payee.name'] !== payeeName && transaction.payee_name !== payeeName) return false;
    if (transaction.amount !== amount) return false;
    if (categoryName && !looksLikeId(categoryName) && transaction['category.name'] !== categoryName) return false;
    return true;
  });
}

async function doctor() {
  const missing = missingConfig();
  const npx = runCapture(NPX_EXECUTABLE, ['--version']);
  const checks = {
    node: {
      version: process.versions.node,
      ok: nodeMajor() >= REQUIRED_NODE_MAJOR,
      required: `>=${REQUIRED_NODE_MAJOR}`,
    },
    npx: {
      ok: npx.ok,
      version: npx.stdout.trim() || null,
      error: npx.ok ? null : npx.stderr.trim(),
    },
    env: {
      ok: missing.length === 0,
      missing,
      hasServerUrl: Boolean(process.env.ACTUAL_SERVER_URL),
      hasSyncId: Boolean(process.env.ACTUAL_SYNC_ID),
      hasCredential: Boolean(process.env.ACTUAL_PASSWORD || process.env.ACTUAL_SESSION_TOKEN),
    },
  };

  if (!checks.node.ok || !checks.npx.ok || !checks.env.ok) {
    outputJson({ ok: false, checks, help: envHelp() });
    return 1;
  }

  const command = actualCommand(['server', 'version']);
  const result = runCapture(command[0], command.slice(1));
  checks.actualServer = {
    ok: result.ok,
    stdout: result.stdout.trim() || null,
    stderr: result.stderr.trim() || null,
  };

  outputJson({ ok: result.ok, checks });
  return result.ok ? 0 : 1;
}

async function main() {
  const { dryRun, fresh, dataDir, command, args } = parseArgs(process.argv.slice(2));
  const session = resolveSession({ fresh, dataDir, dryRun });

  try {
    if (!command || command === '--help' || command === '-h' || command === 'help') {
      printHelp();
      return 0;
    }

    if (command === 'env-help') {
      console.log(envHelp());
      return 0;
    }

    if (command === 'doctor') {
      return await doctor();
    }

    if (command === 'actual') {
      ensureEnvForWritePreview();
      const passthrough = args[0] === '--' ? args.slice(1) : args;
      const actual = actualCommand(passthrough, { redactSecrets: dryRun, ...session });
      if (dryRun) {
        outputJson({ dryRun: true, ...session, command: actual });
        return 0;
      }
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'context') {
      ensureEnvForWritePreview();
      if (dryRun) {
        outputJson(contextDryRun(args, session));
        return 0;
      }
      outputJson(fetchContext(args, session));
      return 0;
    }

    if (command === 'accounts') {
      ensureEnvForWritePreview();
      const actual = actualCommand(['accounts', 'list'], session);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'categories') {
      ensureEnvForWritePreview();
      const actual = actualCommand(['categories', 'list'], session);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'payees') {
      ensureEnvForWritePreview();
      const actual = actualCommand(['payees', 'list'], session);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'id') {
      ensureEnvForWritePreview();
      const { options } = parseOptions(args);
      if (!options.type) throw new Error('Missing required --type');
      if (!options.name) throw new Error('Missing required --name');
      ensureEntityType(options.type);
      const actual = actualCommand(['server', 'get-id', '--type', options.type, '--name', options.name], session);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'recent') {
      ensureEnvForWritePreview();
      const { options } = parseOptions(args);
      const limit = options.limit ?? '10';
      if (!/^\d+$/.test(limit) || Number.parseInt(limit, 10) < 1) {
        throw new Error('--limit must be a positive integer');
      }
      const actual = actualCommand(['query', 'run', '--last', limit], session);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'add-expense') {
      ensureEnvForWritePreview();
      const preview = buildAddExpense(args, { redactSecrets: true, resolveNames: false, ...session });
      if (!preview.yes || dryRun) {
        outputJson({ dryRun: true, ...preview, yes: undefined, actualArgs: undefined });
        return 0;
      }

      const write = buildAddExpense(args, { redactSecrets: false, resolveNames: true, ...session });
      const result = runCapture(NPX_EXECUTABLE, actualBaseArgs(session).concat(write.actualArgs));
      if (!result.ok) {
        console.error(result.stderr || result.stdout || 'Failed to add transaction');
        return result.status;
      }

      const { options } = parseOptions(args);
      const verified = verifyTransaction({
        accountName: options.account,
        payeeName: options.payee,
        amount: write.transaction.amount,
        categoryName: options.category,
        session,
      });

      outputJson({
        ok: true,
        created: write.created,
        resolve: write.resolve,
        transaction: write.transaction,
        write: result.stdout.trim() || 'ok',
        verifiedTransactionId: verified?.id ?? null,
      });
      return 0;
    }

    throw new Error(`Unknown command "${command}". Run with --help for usage.`);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

const exitCode = await main();
process.exitCode = exitCode;
