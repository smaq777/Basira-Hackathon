import { execFileSync } from 'node:child_process';

if (!process.env.PR_NUMBER) {
  console.log('No pull request context; issue-link policy is checked on pull requests.');
  process.exit(0);
}
const repository = process.env.GITHUB_REPOSITORY;
const number = process.env.PR_NUMBER;
if (!/^\d+$/u.test(number) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? ''))
  throw new Error('Invalid PR context');
const request = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
const pr = request(`repos/${repository}/pulls/${number}`);
const automatedDependency = pr.user?.login === 'dependabot[bot]';
if (automatedDependency) {
  if (pr.base.ref !== 'development')
    throw new Error('Dependabot pull requests must target development');
  console.log(
    'Dependabot update: issue intake is required before owner acceptance; no automatic merge.',
  );
  process.exit(0);
}
const productionPromotion =
  pr.base.ref === 'main' &&
  pr.head.ref === 'development' &&
  pr.head.repo?.full_name?.toLowerCase() === repository.toLowerCase();
if (pr.base.ref === 'main' && !productionPromotion)
  throw new Error('Only development may open a production pull request to main');
if (pr.base.ref === 'development' && pr.head.ref === 'main')
  throw new Error('Do not merge production back into development through a reverse pull request');
if (!['development', 'main'].includes(pr.base.ref))
  throw new Error('Pull requests must target development or main');
if (productionPromotion) {
  console.log(
    'Release promotion route verified: development to main; owner acceptance remains required.',
  );
  process.exit(0);
}
if (!/^(?:saleh|ahmed|codex)\/\d+-[a-z0-9-]+$/u.test(pr.head.ref))
  throw new Error('Use a role-scoped saleh|ahmed|codex/<issue>-<slug> branch');
const issueNumber = pr.head.ref.split('/')[1].split('-')[0];
if (!new RegExp(`(?:Related to|Refs) #${issueNumber}(?:\\D|$)`, 'iu').test(pr.body ?? ''))
  throw new Error('PR body must link the branch issue with Related to #<number>');
const issue = request(`repos/${repository}/issues/${issueNumber}`);
if (issue.pull_request || issue.state !== 'open')
  throw new Error('Linked work item must be an open issue');
for (const term of ['acceptance', 'test', 'risk'])
  if (!issue.body?.toLowerCase().includes(term)) throw new Error(`Issue missing ${term} section`);
if (pr.base.ref !== 'development') throw new Error('Feature pull requests must target development');
console.log(
  `PR linked to open issue #${issueNumber} and targets development; owner acceptance remains required.`,
);
