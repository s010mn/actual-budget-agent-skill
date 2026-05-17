#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';

const CLI_PACKAGE = '@actual-app/cli@26.5.2';
const REQUIRED_NODE_MAJOR = 22;
const NPX_EXECUTABLE = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const ENTITY_TYPES = new Set(['accounts', 'categories', 'payees', 'schedules']);

function printHelp() {
  console.log(`Actual Budget agent helper

Usage:
  node actual-budget/scripts/actual-budget.mjs [--dry-run] <command> [options]

Commands:
  doctor                         Check Node, npx, and Actual env vars
  env-help                       Print environment variable setup examples
  actual -- <args>               Pass through to official Actual CLI
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

  if (args[0] === '--dry-run') {
    dryRun = true;
    args.shift();
  }

  const command = args.shift();
  return { dryRun, command, args };
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

function envConfig({ redactSecrets = false } = {}) {
  const password = process.env.ACTUAL_PASSWORD;
  const sessionToken = process.env.ACTUAL_SESSION_TOKEN;

  return {
    serverUrl: process.env.ACTUAL_SERVER_URL,
    syncId: process.env.ACTUAL_SYNC_ID,
    password: redactSecrets ? redacted(password) : password,
    sessionToken: redactSecrets ? redacted(sessionToken) : sessionToken,
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

function actualBaseArgs({ redactSecrets = false } = {}) {
  const config = envConfig({ redactSecrets });
  const args = ['-y', CLI_PACKAGE];

  if (config.serverUrl) args.push('--server-url', config.serverUrl);
  if (config.password) args.push('--password', config.password);
  if (config.sessionToken) args.push('--session-token', config.sessionToken);
  if (config.syncId) args.push('--sync-id', config.syncId);
  args.push('--format', 'json');

  return args;
}

function actualCommand(args, { redactSecrets = false } = {}) {
  return [NPX_EXECUTABLE, ...actualBaseArgs({ redactSecrets }), ...args];
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

function getId(type, name) {
  const command = actualCommand(['server', 'get-id', '--type', type, '--name', name]);
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

function buildAddExpense(args, { redactSecrets = false, resolveNames = false } = {}) {
  const { options } = parseOptions(args);
  for (const key of ['account', 'date', 'amount', 'payee']) {
    if (!options[key]) throw new Error(`Missing required --${key}`);
  }

  validateDate(options.date);
  const amount = amountToExpenseCents(options.amount);

  let account = options.account;
  let category = options.category;
  const resolve = {};

  if (looksLikeId(account)) {
    resolve.account = { type: 'accounts', id: account };
  } else {
    resolve.account = { type: 'accounts', name: account };
    if (resolveNames) account = getId('accounts', account);
  }

  if (category) {
    if (looksLikeId(category)) {
      resolve.category = { type: 'categories', id: category };
    } else {
      resolve.category = { type: 'categories', name: category };
      if (resolveNames) category = getId('categories', category);
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
    transaction,
    command: actualCommand(actualArgs, { redactSecrets }),
    actualArgs,
  };
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
  const { dryRun, command, args } = parseArgs(process.argv.slice(2));

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
      const actual = actualCommand(passthrough, { redactSecrets: dryRun });
      if (dryRun) {
        outputJson({ dryRun: true, command: actual });
        return 0;
      }
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'accounts') {
      ensureEnvForWritePreview();
      const actual = actualCommand(['accounts', 'list']);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'categories') {
      ensureEnvForWritePreview();
      const actual = actualCommand(['categories', 'list']);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'payees') {
      ensureEnvForWritePreview();
      const actual = actualCommand(['payees', 'list']);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'id') {
      ensureEnvForWritePreview();
      const { options } = parseOptions(args);
      if (!options.type) throw new Error('Missing required --type');
      if (!options.name) throw new Error('Missing required --name');
      ensureEntityType(options.type);
      const actual = actualCommand(['server', 'get-id', '--type', options.type, '--name', options.name]);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'recent') {
      ensureEnvForWritePreview();
      const { options } = parseOptions(args);
      const limit = options.limit ?? '10';
      if (!/^\d+$/.test(limit) || Number.parseInt(limit, 10) < 1) {
        throw new Error('--limit must be a positive integer');
      }
      const actual = actualCommand(['query', 'run', '--last', limit]);
      return await runCommand(actual[0], actual.slice(1));
    }

    if (command === 'add-expense') {
      ensureEnvForWritePreview();
      const preview = buildAddExpense(args, { redactSecrets: true, resolveNames: false });
      if (!preview.yes || dryRun) {
        outputJson({ dryRun: true, ...preview, yes: undefined, actualArgs: undefined });
        return 0;
      }

      const write = buildAddExpense(args, { redactSecrets: false, resolveNames: true });
      return await runCommand(NPX_EXECUTABLE, actualBaseArgs().concat(write.actualArgs));
    }

    throw new Error(`Unknown command "${command}". Run with --help for usage.`);
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

const exitCode = await main();
process.exitCode = exitCode;
