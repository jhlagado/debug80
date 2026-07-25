/**
 * Checks every link in the repository's tracked markdown.
 *
 * Two kinds of breakage matter here and both have bitten us:
 *
 *   - Repository-relative links that point at a file which has moved or was
 *     never there. These also silently fail on the Marketplace README page,
 *     where relative paths do not resolve at all, so links in a published
 *     README have to be absolute.
 *   - Links to debug80.com that outlived a change to the site's structure.
 *
 * Usage:
 *   node scripts/check-links.mjs            check relative links only
 *   node scripts/check-links.mjs --external also fetch every external URL
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const CHECK_EXTERNAL = process.argv.includes('--external');

/** READMEs that are published outside the repo, where relative links break. */
const PUBLISHED = new Set(['apps/debug80-vscode/README.md']);

const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);

/** Markdown inline links, plus bare autolinks in angle brackets. */
function linksIn(text) {
  const out = [];
  const inline = /\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  const auto = /<((?:https?|mailto):[^>\s]+)>/g;
  for (const re of [inline, auto]) {
    let m;
    while ((m = re.exec(text)) !== null) {
      const line = text.slice(0, m.index).split('\n').length;
      out.push({ target: m[1], line });
    }
  }
  return out;
}

/** Strips fenced code blocks so example URLs in samples are not checked. */
function withoutCode(text) {
  return text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
}

const problems = [];
const external = new Map();

for (const file of files) {
  const abs = path.join(ROOT, file);
  const text = withoutCode(readFileSync(abs, 'utf8'));

  for (const { target, line } of linksIn(text)) {
    if (target.startsWith('#') || target.startsWith('mailto:')) continue;

    if (/^https?:\/\//i.test(target)) {
      const clean = target.replace(/[.,;]+$/, '');
      if (!external.has(clean)) external.set(clean, []);
      external.get(clean).push({ file, line });
      continue;
    }

    // A published README's relative links do not resolve where it is shown.
    if (PUBLISHED.has(file)) {
      problems.push({ file, line, target, why: 'relative link in a published README' });
      continue;
    }

    const [rel] = target.split('#');
    if (!rel) continue;
    const resolved = path.resolve(path.dirname(abs), decodeURIComponent(rel));
    if (!existsSync(resolved)) {
      problems.push({ file, line, target, why: 'file not found' });
    }
    // A link to a directory is fine: GitHub renders its listing, or its
    // README.md when there is one.
  }
}

let checked = 0;
if (CHECK_EXTERNAL) {
  const urls = [...external.keys()].sort();
  for (const url of urls) {
    checked += 1;
    let status = 0;
    try {
      // Some hosts refuse HEAD; fall back to GET before believing a failure.
      let res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      if (res.status >= 400) {
        res = await fetch(url, { method: 'GET', redirect: 'follow' });
      }
      status = res.status;
    } catch (err) {
      status = `unreachable (${err.cause?.code ?? err.message})`;
    }
    if (status !== 200) {
      for (const { file, line } of external.get(url)) {
        problems.push({ file, line, target: url, why: `HTTP ${status}` });
      }
    }
  }
}

const relCount = [...external.values()].reduce((n, uses) => n + uses.length, 0);
console.log(
  `\n  ${files.length} markdown files, ${relCount} external links, ` +
    `${CHECK_EXTERNAL ? `${checked} fetched` : 'external checks skipped (--external to run them)'}`,
);

if (problems.length === 0) {
  console.log('\nAll links resolve.\n');
  process.exit(0);
}

console.error(`\n${problems.length} broken link${problems.length === 1 ? '' : 's'}:\n`);
for (const p of problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
  console.error(`  ${p.file}:${p.line}  ${p.target}\n      ${p.why}`);
}
console.error('');
process.exit(1);
