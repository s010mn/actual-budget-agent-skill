import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'actual-budget', 'scripts', 'actual-budget.mjs');

function run(args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      ComSpec: process.env.ComSpec,
      ...options.env,
    },
  });
}

test('doctor reports missing configuration without leaking secrets', () => {
  const result = run(['doctor']);
  assert.equal(result.status, 1);

  const output = `${result.stdout}\n${result.stderr}`;
  assert.match(output, /ACTUAL_SERVER_URL/);
  assert.match(output, /ACTUAL_SYNC_ID/);
  assert.match(output, /ACTUAL_PASSWORD/);
  assert.match(output, /ACTUAL_SESSION_TOKEN/);
  assert.match(output, /PowerShell/);
  assert.match(output, /bash\/zsh/);
});

test('add-expense defaults to dry-run and converts decimals to negative cents', () => {
  const result = run(
    [
      'add-expense',
      '--account',
      'Cash',
      '--date',
      '2026-05-17',
      '--amount',
      '12.34',
      '--payee',
      'Coffee Shop',
      '--category',
      'Food',
      '--notes',
      'latte',
    ],
    {
      env: {
        ACTUAL_SERVER_URL: 'http://actual.example',
        ACTUAL_SYNC_ID: 'budget-sync-id',
        ACTUAL_SESSION_TOKEN: 'example-session-token',
      },
    },
  );

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.transaction.amount, -1234);
  assert.equal(payload.transaction.date, '2026-05-17');
  assert.equal(payload.transaction.payee_name, 'Coffee Shop');
  assert.equal(payload.transaction.notes, 'latte');
  assert.deepEqual(payload.resolve, {
    account: { type: 'accounts', name: 'Cash' },
    category: { type: 'categories', name: 'Food' },
  });
  assert.match(payload.command[0], /^npx(?:\.cmd)?$/);
  assert.deepEqual(payload.command.slice(1, 4), ['-y', '@actual-app/cli@26.5.2', '--server-url']);
});

test('add-expense rejects invalid dates before invoking Actual CLI', () => {
  const result = run(
    [
      'add-expense',
      '--account',
      'Cash',
      '--date',
      '17-05-2026',
      '--amount',
      '12.34',
      '--payee',
      'Coffee Shop',
    ],
    {
      env: {
        ACTUAL_SERVER_URL: 'http://actual.example',
        ACTUAL_SYNC_ID: 'budget-sync-id',
        ACTUAL_SESSION_TOKEN: 'example-session-token',
      },
    },
  );

  assert.equal(result.status, 1);
  assert.match(result.stderr, /YYYY-MM-DD/);
});

test('actual passthrough builds pinned CLI command in dry-run mode', () => {
  const result = run(['--dry-run', 'actual', '--', 'server', 'version'], {
    env: {
      ACTUAL_SERVER_URL: 'http://actual.example',
      ACTUAL_SYNC_ID: 'budget-sync-id',
      ACTUAL_SESSION_TOKEN: 'example-session-token',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.command, [
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    '-y',
    '@actual-app/cli@26.5.2',
    '--server-url',
    'http://actual.example',
    '--session-token',
    '<redacted>',
    '--sync-id',
    'budget-sync-id',
    '--format',
    'json',
    'server',
    'version',
  ]);
});

test('--fresh dry-run command uses a redacted temporary Actual data dir', () => {
  const result = run(['--dry-run', '--fresh', 'actual', '--', 'categories', 'list'], {
    env: {
      ACTUAL_SERVER_URL: 'http://actual.example',
      ACTUAL_SYNC_ID: 'budget-sync-id',
      ACTUAL_SESSION_TOKEN: 'example-session-token',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.fresh, true);
  assert.equal(payload.dataDir, '<temp>');
  assert.deepEqual(payload.command, [
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    '-y',
    '@actual-app/cli@26.5.2',
    '--server-url',
    'http://actual.example',
    '--session-token',
    '<redacted>',
    '--sync-id',
    'budget-sync-id',
    '--data-dir',
    '<temp>',
    '--format',
    'json',
    'categories',
    'list',
  ]);
});

test('--data-dir dry-run command passes the provided Actual data dir', () => {
  const dataDir = path.join(root, '.tmp-actual-session');
  const result = run(['--dry-run', '--data-dir', dataDir, 'actual', '--', 'accounts', 'list'], {
    env: {
      ACTUAL_SERVER_URL: 'http://actual.example',
      ACTUAL_SYNC_ID: 'budget-sync-id',
      ACTUAL_PASSWORD: 'example-password',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dataDir, dataDir);
  assert.deepEqual(payload.command, [
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    '-y',
    '@actual-app/cli@26.5.2',
    '--server-url',
    'http://actual.example',
    '--password',
    '<redacted>',
    '--sync-id',
    'budget-sync-id',
    '--data-dir',
    dataDir,
    '--format',
    'json',
    'accounts',
    'list',
  ]);
});

test('context dry-run reports the aggregate read plan', () => {
  const result = run(['--dry-run', 'context', '--recent-limit', '5'], {
    env: {
      ACTUAL_SERVER_URL: 'http://actual.example',
      ACTUAL_SYNC_ID: 'budget-sync-id',
      ACTUAL_SESSION_TOKEN: 'example-session-token',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.recentLimit, '5');
  assert.deepEqual(payload.commands.map((command) => command.slice(-2).join(' ')), [
    'accounts list',
    'categories list',
    'category-groups list',
    '--last 5',
  ]);
  for (const command of payload.commands) {
    assert.equal(command.includes('example-session-token'), false);
    assert.equal(command.includes('<redacted>'), true);
  }
});

test('fresh context dry-run reports reusable task data dir placeholder', () => {
  const result = run(['--dry-run', '--fresh', 'context', '--recent-limit', '5'], {
    env: {
      ACTUAL_SERVER_URL: 'http://actual.example',
      ACTUAL_SYNC_ID: 'budget-sync-id',
      ACTUAL_SESSION_TOKEN: 'example-session-token',
    },
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.fresh, true);
  assert.equal(payload.dataDir, '<temp>');
  for (const command of payload.commands) {
    assert.equal(command.includes('--data-dir'), true);
    assert.equal(command.includes('<temp>'), true);
  }
});

test('add-expense dry-run can describe category creation intent', () => {
  const result = run(
    [
      'add-expense',
      '--account',
      '花呗',
      '--date',
      '2026-05-17',
      '--amount',
      '42',
      '--payee',
      '麦当劳',
      '--category-group',
      '可裁剪消费',
      '--category',
      '快餐外食',
      '--create-category',
    ],
    {
      env: {
        ACTUAL_SERVER_URL: 'http://actual.example',
        ACTUAL_SYNC_ID: 'budget-sync-id',
        ACTUAL_SESSION_TOKEN: 'example-session-token',
      },
    },
  );

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.dryRun, true);
  assert.deepEqual(payload.resolve.categoryGroup, {
    type: 'category-groups',
    name: '可裁剪消费',
    createIfMissing: true,
  });
  assert.deepEqual(payload.resolve.category, {
    type: 'categories',
    name: '快餐外食',
    groupName: '可裁剪消费',
    createIfMissing: true,
  });
  assert.equal(payload.transaction.amount, -4200);
});
