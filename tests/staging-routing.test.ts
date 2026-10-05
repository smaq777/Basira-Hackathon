import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('isolated Vercel staging routing', () => {
  it('restricts every staging workflow job to development, including manual dispatch', () => {
    const workflow = readFileSync('.github/workflows/deploy-staging.yml', 'utf8');
    const conditions = [...workflow.matchAll(/^    if: (.+)$/gmu)].map((row) => row[1]);
    expect(conditions).toHaveLength(3);
    for (const condition of conditions)
      expect(condition).toContain("github.ref == 'refs/heads/development'");
  });
  it('proxies only API paths to the fixed staging service without a frontend fallback', () => {
    const config = JSON.parse(readFileSync('vercel.staging.json', 'utf8'));
    expect(config.rewrites).toEqual([
      {
        source: '/api/:path*',
        destination: 'https://api-staging-42bc.up.railway.app/api/:path*',
      },
    ]);
    const production = JSON.parse(readFileSync('vercel.json', 'utf8'));
    expect(JSON.stringify(production)).not.toContain('api-staging-42bc');
    expect(production.rewrites).toEqual([
      {
        source: '/api/:path*',
        destination: 'https://api-production-4834.up.railway.app/api/:path*',
      },
    ]);
    expect(readFileSync('.github/workflows/deploy-production.yml', 'utf8')).not.toContain(
      'vercel.staging.json',
    );
  });
});
