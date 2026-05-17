import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillPath = path.join(root, 'actual-budget', 'SKILL.md');

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  assert.ok(match, 'SKILL.md must start with YAML frontmatter');

  const fields = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    assert.notEqual(separator, -1, `Invalid frontmatter line: ${rawLine}`);
    fields[line.slice(0, separator)] = line.slice(separator + 1).trim();
  }
  return fields;
}

test('SKILL.md uses portable Agent Skills metadata', () => {
  const markdown = fs.readFileSync(skillPath, 'utf8');
  const fields = parseFrontmatter(markdown);

  assert.equal(fields.name, 'actual-budget');
  assert.match(fields.description, /^Use when /);
  assert.match(fields.description, /Actual Budget/);
  assert.match(fields.description, /transactions/);
  assert.match(fields.description, /ActualQL/);
  assert.equal(fields.license, 'MIT');
  assert.equal(fields.compatibility, undefined);
  assert.match(markdown, /Requires Node\.js 22\+/);
});
