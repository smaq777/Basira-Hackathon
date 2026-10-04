import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
for (const file of files) {
  const environmentTemplate = /(?:^|\/)(?:\.env|[^/]+\.env)\.example$/u.test(file);
  if (
    (/(?:^|\/)\.env(?:\.|$)/u.test(file) || /(?:^|\/)[^/]+\.env(?:\.|$)/u.test(file)) &&
    !environmentTemplate
  )
    errors.push(`Environment file must not be tracked: ${file}`);
  if (
    /\.(?:pem|key|p12|pfx|jks|sqlite|db)(?:[-.]|$)/iu.test(file) ||
    /(?:^|\/)(?:private|raw|licensed|credentials|secrets|team-notes|conversations|transcripts|\.mcp|\.codex|\.claude|\.cursor)\//u.test(
      file,
    ) ||
    /(?:^|\/)\.mcp\.json$/u.test(file)
  )
    errors.push(`Sensitive-data path: ${file}`);
  if (!environmentTemplate && !/\.(?:md|json|ya?ml|[cm]?js|tsx?|css|html)$/u.test(file)) continue;
  const text = readFileSync(file, 'utf8');
  if (/^(?:<<<<<<< |=======|>>>>>>> )/mu.test(text)) errors.push(`Unresolved conflict: ${file}`);
  if (/\/Users\/[A-Za-z0-9_-]+\//u.test(text)) errors.push(`Non-portable personal path: ${file}`);
  if (
    /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|npm_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/u.test(
      text,
    )
  )
    errors.push(`Possible credential: ${file}`);
  if (environmentTemplate) {
    for (const line of text.split('\n')) {
      if (/^[A-Z_]*(?:KEY|SECRET|TOKEN|DATABASE_URL)[A-Z_]*=.+/u.test(line))
        errors.push(`Secret fields in ${file} must be blank`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log('Bounded policy checks passed. This is not a full secret-history or security audit.');
