// Explicit maintenance command: creates or updates Basirah issues. Never run in CI.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

if (!process.argv.includes('--apply')) throw new Error('External write requires explicit --apply');
const repository = 'smaq777/basirah';
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
for (const entry of entries) {
  const existing = current.find(
    (item) => item.number === entry.number || item.title === entry.title,
  );
  if (existing && existing.number !== entry.number)
    throw new Error(`Unexpected issue mapping for ${entry.title}; inspect before writing`);
  if (existing && entry.number > 9 && existing.title !== entry.title)
    throw new Error(`Issue #${entry.number} is occupied; do not overwrite`);
  const body = `## Scope\n${entry.scope}\n\n## Acceptance criteria\n${entry.acceptance.map((value) => `- [ ] ${value}`).join('\n')}\n\n## Tests and evidence\n${entry.tests}\n\n## Dependencies\n${entry.dependencies.map((number) => `- #${number}`).join('\n')}\n\n## Risk and rollback / forward-fix\n${entry.risk}\n\n## Documentation and delivery policy\nEnglish-first documentation; preserve Arabic Islamic terms and examples. Use an issue-linked role-scoped branch, PR, checks and owner acceptance. Planned work is not completed work.\n`;
  const desired = {
    title: entry.title,
    body,
    milestone: entry.milestone ?? null,
    labels: [
      `priority:${entry.priority}`,
      `area:${entry.area}`,
      `type:${entry.type}`,
      entry.number > 21 ? 'phase:later' : 'phase:mvp',
      ...([2, 9, 19].includes(entry.number) ? ['status:blocked'] : []),
    ],
  };
  const result = api(
    `repos/${repository}/issues${existing ? `/${existing.number}` : ''}`,
    existing ? 'PATCH' : 'POST',
    desired,
  );
  console.log(`${existing ? 'Updated' : 'Created'} #${result.number} ${result.title}`);
  if (result.number !== entry.number)
    throw new Error('Unexpected assigned issue number; stop and reconcile');
  if (!existing) current.push(result);
}
