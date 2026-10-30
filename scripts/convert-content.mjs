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
 *   ## Heading                →  ## Heading {.mt-4 data-toc-skip=""}
 *   {: .mt-4 data-toc-skip='' }
 *
 *   `x`{: .filepath }         →  {{< filepath "x" >}}
 *
 *   ```shell                  →  ```shell {.nolineno}
 *   code                         code
 *   ```
 *   {: .nolineno }
 *
 *   ![alt](src){: .left }     →  {{< img src="src" alt="alt" class="left" >}}
 *
 *   {% include embed/youtube.html id='x' %}  →  {{< embed-youtube id="x" >}}
 *
 * Fenced code is copied verbatim: the upstream posts demonstrate this very
 * syntax inside code blocks, and rewriting a sample would teach the wrong
 * thing. Fences may be indented (inside a list) and may be longer than three
 * backticks.
 *
 * Anything it does not recognise is reported and left untouched: a wrong guess
 * would silently change the rendered page.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const FENCE = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;

function parseIal(attrs) {
  const classes = [];
  const pairs = [];
  for (const match of attrs.matchAll(/(\.?[\w-]+(?:=(?:"[^"]*"|'[^']*'))?)/g)) {
    const token = match[1];
    if (token.startsWith('.')) classes.push(token.slice(1));
    else if (token.includes('=')) {
      const [key, value] = token.split('=');
      pairs.push([key, value.replace(/^["']|["']$/g, '')]);
    }
  }
  return { classes, pairs };
}

const ialLine = (line) => /^\s*\{:\s*([^}]+)\s*\}\s*$/.exec(line);

// --- prompts ---------------------------------------------------------------

function convertPrompts(source) {
  const lines = source.split('\n');
  const out = [];
  let changes = 0;
  for (const line of lines) {
    const attr = ialLine(line);
    if (attr) {
      const prompt = /^\.prompt-(tip|info|warning|danger)$/.exec(attr[1].trim());
      let start = out.length;
      while (start > 0 && /^\s*>/.test(out[start - 1])) start -= 1;
      if (prompt && start < out.length) {
        const quoted = out.splice(start).map((l) => l.replace(/^\s*>\s?/, ''));
        out.push(`{{< prompt ${prompt[1]} >}}`, ...quoted, '{{< /prompt >}}');
        changes += 1;
        continue;
      }
    }
    out.push(line);
  }
  return { source: out.join('\n'), changes };
}

// --- headings --------------------------------------------------------------

function convertHeadings(source) {
  const lines = source.split('\n');
  const out = [];
  let changes = 0;
  for (const line of lines) {
    const attr = ialLine(line);
    if (attr && out.length && /^#{1,6}\s/.test(out.at(-1))) {
      const { classes, pairs } = parseIal(attr[1]);
      const merged = [
        ...classes.map((c) => `.${c}`),
        ...pairs.map(([k, v]) => `${k}="${v}"`),
      ];
      out[out.length - 1] = `${out.at(-1).trimEnd()} {${merged.join(' ')}}`;
      changes += 1;
      continue;
    }
    out.push(line);
  }
  return { source: out.join('\n'), changes };
}

// --- inline ----------------------------------------------------------------

function convertInline(source) {
  let changes = 0;
  const converted = source.replace(/`([^`\n]+)`\{:\s*\.filepath\s*\}/g, (_, code) => {
    changes += 1;
    return `{{< filepath "${code}" >}}`;
  });
  return { source: converted, changes };
}

// --- images ----------------------------------------------------------------

/**
 * Run `fn` only outside inline code spans. A backtick-quoted sample of the
 * Jekyll syntax is documentation, not a construct to convert.
 */
function outsideInlineCode(source, fn) {
  let changes = 0;
  const parts = source.split(/(`[^`\n]*`)/g);
  const converted = parts
    .map((part) => {
      if (part.startsWith('`') && part.endsWith('`')) return part;
      const result = fn(part);
      changes += result.changes;
      return result.source;
    })
    .join('');
  return { source: converted, changes };
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

// --- embeds ----------------------------------------------------------------

function convertEmbeds(source) {
  let changes = 0;
  const converted = source.replace(
    /\{%\s*include\s+embed\/(youtube|spotify|bilibili|twitch|audio|video)\.html\s+([^%]*?)\s*%\}/g,
    (_, kind, args) => {
      const params = [...args.matchAll(/([\w-]+)=['"]([^'"]*)['"]/g)]
        .map(([, key, value]) => `${key}="${value}"`)
        .join(' ');
      changes += 1;
      return `{{< embed/${kind} ${params} >}}`;
    },
  );
  return { source: converted, changes };
}

// --- fences ----------------------------------------------------------------

/**
 * Merge `{: ... }` after a closing fence into the fence's info string.
 *
 * Tracks fence length and indentation so a fenced sample that itself shows a
 * fence is not mistaken for the end of the outer block.
 */
function convertFences(source) {
  const lines = source.split('\n');
  const out = [];
  let open = null; // { index, char, length }
  let changes = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = FENCE.exec(line);
    if (!open && match) {
      open = { index: out.length, char: match[2][0], length: match[2].length };
      out.push(line);
      continue;
    }
    if (open) {
      out.push(line);
      const close = new RegExp(`^\\s{0,3}${open.char === '`' ? '`' : '~'}{${open.length},}\\s*$`);
      if (close.test(line)) {
        const attr = ialLine(lines[i + 1] ?? '');
        if (attr) {
          const { classes, pairs } = parseIal(attr[1]);
          const merged = [...classes.map((c) => `.${c}`), ...pairs.map(([k, v]) => `${k}="${v}"`)];
          if (merged.length) {
            out[open.index] = `${out[open.index].trimEnd()} {${merged.join(' ')}}`;
            changes += 1;
            i += 1;
          }
        }
        open = null;
      }
      continue;
    }
    out.push(line);
  }
  return { source: out.join('\n'), changes };
}

// --- driver ----------------------------------------------------------------

function convertChunk(chunk) {
  let total = 0;
  for (const step of [convertPrompts, convertHeadings, convertInline]) {
    const result = step(chunk);
    chunk = result.source;
    total += result.changes;
  }
  for (const step of [convertImages, convertEmbeds]) {
    const result = outsideInlineCode(chunk, step);
    chunk = result.source;
    total += result.changes;
  }
  return { source: chunk, changes: total };
}

function convert(source) {
  const lines = source.split('\n');
  const out = [];
  let open = null;
  let chunk = [];
  let changes = 0;

  const flush = () => {
    if (!chunk.length) return;
    const result = convertChunk(chunk.join('\n'));
    out.push(...result.source.split('\n'));
    changes += result.changes;
    chunk = [];
  };

  for (const line of lines) {
    const match = FENCE.exec(line);
    if (!open && match) {
      flush();
      open = { char: match[2][0], length: match[2].length };
      out.push(line);
      continue;
    }
    if (open) {
      out.push(line);
      const close = new RegExp(`^\\s{0,3}${open.char === '`' ? '`' : '~'}{${open.length},}\\s*$`);
      if (close.test(line)) open = null;
      continue;
    }
    chunk.push(line);
  }
  flush();

  let text = out.join('\n');
  const fences = convertFences(text);
  text = fences.source;
  changes += fences.changes;

  // Leftovers outside code are reported: they need a human.
  const leftovers = [];
  let inFence = null;
  for (const line of text.split('\n')) {
    const match = FENCE.exec(line);
    if (!inFence && match) {
      inFence = { char: match[2][0], length: match[2].length };
      continue;
    }
    if (inFence) {
      const close = new RegExp(`^\\s{0,3}${inFence.char === '`' ? '`' : '~'}{${inFence.length},}\\s*$`);
      if (close.test(line)) inFence = null;
      continue;
    }
    if (ialLine(line)) leftovers.push(line.trim());
  }
  return { source: text, changes, leftovers };
}

// --- CLI -------------------------------------------------------------------

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
