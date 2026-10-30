#!/usr/bin/env node
/**
 * Convert kramdown attribute lists (IAL) to native Hugo syntax.
 *
 *   node scripts/convert-content.mjs --dry-run content/     # report only
 *   node scripts/convert-content.mjs --write content/       # rewrite in place
 *
 * This is the one-shot migration a new adopter runs over their posts. It is
 * deliberately explicit (R6): no build-time magic, no silent rewrite. Run it
 * twice and the second run reports zero changes.
 *
 * Conversions (see docs/SHORTCODES.md):
 *
 *   > text                    →  {{< prompt tip >}}
 *   {: .prompt-tip }             text
 *                                {{< /prompt >}}
 *
 *   `x`{: .filepath }         →  {{< filepath "x" >}}
 *
 *   ```shell {.nolineno}      →  ```shell {.nolineno}   (attribute moved to the
 *   code                         code                 fence's info string)
 *   ```
 *   {: .nolineno }
 *
 *   ![alt](src){: .left }     →  {{< img src="src" alt="alt" class="left" >}}
 *
 * Anything it does not recognise is reported and left untouched: a wrong guess
 * would silently change the rendered page.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const PROMPTS = new Set(['tip', 'info', 'warning', 'danger']);

function stripQuote(lines) {
  return lines.map((line) => line.replace(/^>\s?/, ''));
}

function convertPrompts(source) {
  let changes = 0;
  const lines = source.split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i += 1) {
    const attr = /^\{:\s*\.prompt-(tip|info|warning|danger)\s*\}$/.exec(lines[i].trim());
    if (!attr) {
      out.push(lines[i]);
      continue;
    }
    // Walk back over the blockquote this attribute closes.
    let start = out.length;
    while (start > 0 && out[start - 1].startsWith('>')) start -= 1;
    if (start === out.length) {
      out.push(lines[i]);
      continue;
    }
    const quoted = out.splice(start);
    out.push(`{{< prompt ${attr[1]} >}}`);
    out.push(...stripQuote(quoted));
    out.push('{{< /prompt >}}');
    changes += 1;
  }
  return { source: out.join('\n'), changes };
}

function convertInline(source) {
  let changes = 0;
  const converted = source.replace(/`([^`\n]+)`\{:\s*\.filepath\s*\}/g, (_, code) => {
    changes += 1;
    return `{{< filepath "${code}" >}}`;
  });
  return { source: converted, changes };
}

/** Parse the inside of a kramdown attribute list: `.class` and `key="value"`. */
function parseIal(attrs) {
  const classes = [];
  const pairs = [];
  for (const match of attrs.matchAll(/(\.?[\w-]+(?:="[^"]*")?)/g)) {
    const token = match[1];
    if (token.startsWith('.')) classes.push(token.slice(1));
    else if (token.includes('=')) {
      const [key, value] = token.split('=');
      pairs.push([key, value.replaceAll('"', '')]);
    }
  }
  return { classes, pairs };
}

/**
 * Moves `{: ... }` after a closing fence into the fence's info string.
 *
 * Line based on purpose: a regular expression over the whole document happily
 * spans from one fence to the next and attaches the attribute to the wrong
 * block.
 */
function convertFences(source) {
  const lines = source.split('\n');
  const out = [];
  let open = false;
  let opening = -1;
  let changes = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (!open) {
        open = true;
        opening = out.length;
        out.push(line);
      } else {
        open = false;
        const attr = /^\{:\s*([^}]+)\s*\}$/.exec((lines[i + 1] ?? '').trim());
        if (attr && opening >= 0) {
          const { classes, pairs } = parseIal(attr[1]);
          const merged = [...classes.map((c) => `.${c}`), ...pairs.map(([k, v]) => `${k}="${v}"`)];
          if (merged.length) {
            out[opening] = `${out[opening].trimEnd()} {${merged.join(' ')}}`;
            changes += 1;
            i += 1; // consume the attribute line
          }
        }
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return { source: out.join('\n'), changes };
}

function convertImages(source) {
  let changes = 0;
  const converted = source.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)\{:\s*([^}\n]+)\s*\}/g,
    (_, alt, src, attrs) => {
      const { classes, pairs } = parseIal(attrs);
      const parts = [`src="${src}"`, `alt="${alt}"`];
      if (classes.length) parts.push(`class="${classes.join(' ')}"`);
      for (const [key, value] of pairs) {
        if (key === 'w') parts.push(`width=${value}`);
        else if (key === 'h') parts.push(`height=${value}`);
        else parts.push(`${key}="${value}"`);
      }
      changes += 1;
      return `{{< img ${parts.join(' ')} >}}`;
    },
  );
  return { source: converted, changes };
}

function convert(source) {
  let total = 0;
  for (const step of [convertPrompts, convertInline, convertFences, convertImages]) {
    const result = step(source);
    source = result.source;
    total += result.changes;
  }
  // Anything still shaped like an IAL was not recognised.
  const leftovers = [...source.matchAll(/^\{:\s*\.[^\n]*$/gm)].map((m) => m[0]);
  return { source, changes: total, leftovers };
}

function walk(target) {
  const stat = fs.statSync(target);
  if (stat.isFile()) return [target];
  const out = [];
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const abs = path.join(target, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const write = args.includes('--write');
const target = args.find((arg) => !arg.startsWith('-'));

if (!target || (!dryRun && !write)) {
  console.error('usage: node scripts/convert-content.mjs --dry-run|--write <file-or-directory>');
  process.exit(2);
}

const files = walk(path.resolve(target));
let changedFiles = 0;
let totalChanges = 0;
let leftoverFiles = 0;

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const result = convert(original);
  if (result.leftovers.length) {
    leftoverFiles += 1;
    console.error(`${path.relative(process.cwd(), file)}: ${result.leftovers.length} unrecognised attribute list(s)`);
    for (const line of result.leftovers.slice(0, 5)) console.error(`  ${line}`);
  }
  if (!result.changes) continue;
  changedFiles += 1;
  totalChanges += result.changes;
  if (!dryRun && result.source !== original) fs.writeFileSync(file, result.source);
}

console.log(
  `${dryRun ? 'would change' : 'changed'} ${changedFiles} file(s), ${totalChanges} construct(s)` +
    (leftoverFiles ? `, ${leftoverFiles} file(s) need a human` : ''),
);
process.exit(leftoverFiles ? 1 : 0);
