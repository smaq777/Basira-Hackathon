import { expect, it } from 'vitest';
import { cachePassageConnections } from '../scripts/cache-passage-connections.js';
const r = 'postgresql://reader:owned@child.example.org/basirah_research?sslmode=require',
  w = 'postgresql://writer:owned@child.example.org/basirah_research?channel_binding=require';
it('permits reader-only preparation and distinct reader/writer principals on the exact same direct database', () => {
  expect(cachePassageConnections(r, undefined, false).writer).toBeUndefined();
  const both = cachePassageConnections(r, w, true);
  expect(both.reader).not.toContain('sslmode');
  expect(both.writer).not.toContain('channel_binding');
});
it('rejects missing write credentials, mismatched endpoint/database/port, pooled hosts and shared principals before connection', () => {
  for (const writer of [
    undefined,
    w.replace('child.example.org', 'active.example.org'),
    w.replace('basirah_research', 'production'),
    w.replace('child.example.org', 'child.example.org:5433'),
    r,
    w.replace('child.example.org', 'child-pooler.example.org'),
  ])
    expect(() => cachePassageConnections(r, writer, true)).toThrow();
  expect(() => cachePassageConnections(undefined, w, true)).toThrow();
  expect(() => cachePassageConnections('https://child.example.org/db', undefined, false)).toThrow();
});
