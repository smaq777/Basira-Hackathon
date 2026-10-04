// Read-only maintenance command: verifies that the planning catalogue matches live issues.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

if (process.argv.includes('--apply'))
  throw new Error('Bulk issue writes are disabled; update issues through reviewed GitHub changes');
const repository = 'smaq777/Basira-Hackathon';
const entries = JSON.parse(readFileSync('docs/planning/issues.json', 'utf8'));
const api = (path, method = 'GET', input) =>
  JSON.parse(
    execFileSync('gh', ['api', path, '--method', method, ...(input ? ['--input', '-'] : [])], {
      encoding: 'utf8',
      input: input ? JSON.stringify(input) : undefined,
      timeout: 60000,
    }),
  );
const current = api(`repos/${repository}/issues?state=all&per_page=100`).filter(
  (item) => !item.pull_request,
);
const errors = [];
for (const entry of entries) {
  const byNumber = current.find((item) => item.number === entry.number);
  const byTitle = current.find((item) => item.title === entry.title);
  if (!byNumber) errors.push(`Missing live issue #${entry.number}: ${entry.title}`);
  else if (byNumber.title !== entry.title)
    errors.push(
      `Issue #${entry.number} title mismatch: expected "${entry.title}", found "${byNumber.title}"`,
    );
  if (byTitle && byTitle.number !== entry.number)
    errors.push(`Title mapped to #${byTitle.number}, not #${entry.number}: ${entry.title}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `Verified ${entries.length} issue catalogue entries against ${repository}; no writes made.`,
);
