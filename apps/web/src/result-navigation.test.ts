import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

// These guard the CSS contract; viewport sticking and scrolling require browser QA.
describe('result navigation layout contract', () => {
  it('does not create an overflowing result-page scroll ancestor', () => {
    const pageRule = stylesheet.match(/\.result-page \{([^}]+)\}/)?.[1];
    expect(pageRule).toContain('overflow-x: clip;');
    expect(pageRule).not.toMatch(/overflow(?:-[xy])?:\s*(hidden|auto|scroll)/);
  });

  it('bounds the sticky desktop menu and lets all entries scroll into view', () => {
    const navRule = stylesheet.match(/\.foundation-report-nav \{([^}]+)\}/)?.[1];
    expect(navRule).toContain('position: sticky;');
    expect(navRule).toContain('top: 18px;');
    expect(navRule).toContain('max-height: calc(100vh - 36px);');
    expect(navRule).toContain('max-height: calc(100dvh - 36px);');
    expect(navRule).toContain('overflow-y: auto;');
  });

  it('retains the existing horizontal responsive navigation', () => {
    const responsiveRules = stylesheet.slice(stylesheet.lastIndexOf('@media (max-width: 980px)'));
    const navRule = responsiveRules.match(/\.foundation-report-nav \{([^}]+)\}/)?.[1];
    expect(navRule).toContain('top: 0;');
    expect(navRule).toContain('max-height: none;');
    expect(navRule).toContain('display: flex;');
    expect(navRule).toContain('overflow-x: auto;');
    expect(navRule).toContain('overflow-y: hidden;');
  });
});
