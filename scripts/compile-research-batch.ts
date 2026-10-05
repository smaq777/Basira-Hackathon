import { readFileSync, writeFileSync } from 'node:fs';
import { compileResearchBatch } from '../apps/api/src/research-batch-compiler.js';

const [input, output] = process.argv.slice(2);
if (!input || !output || process.argv.length !== 4)
  throw new Error(
    'Usage: tsx scripts/compile-research-batch.ts <external-input.json> <external-manifest.json>',
  );
const result = compileResearchBatch(JSON.parse(readFileSync(input, 'utf8')));
writeFileSync(output, JSON.stringify(result.manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result.diagnostics, null, 2));
