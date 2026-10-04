import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const files = [
  ...new Set(
    execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean),
  ),
];
const errors = [];
for (const file of files.filter((name) => name.endsWith('.md'))) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/gu)) {
    const target = match[1];
    if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
    const local = decodeURIComponent(target.split('#')[0]);
    if (local.startsWith('/') || !existsSync(resolve(dirname(file), local)))
      errors.push(`${file}: unresolved/non-portable link ${target}`);
  }
}
for (const path of [
  'docs/README.md',
  'docs/STATUS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/hackathon/JUDGE_QUICKSTART.md',
  'docs/operations/CREDENTIALS.md',
  'docs/operations/DEPLOYMENT.md',
  'docs/governance/WORKFLOW.md',
  'docs/api/OPENAPI.yaml',
  'docs/product/GLOSSARY.md',
]) {
  if (!existsSync(path)) errors.push(`Missing required document: ${path}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `Documentation links checked across ${files.filter((name) => name.endsWith('.md')).length} Markdown files. External links and anchors are not network-validated.`,
);
