// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import sourcePolicy from '../../../config/source-policy.json' with { type: 'json' };
import { selectedWebResources, SourceInformation } from './source-information.js';

afterEach(cleanup);

describe('project resource catalogue', () => {
  it('does not list disabled or denied resources as selected', () => {
    const policy: { sources: typeof sourcePolicy.sources; deniedDomains: string[] } =
      structuredClone(sourcePolicy);
    policy.sources[0]!.enabled = false;
    policy.deniedDomains.push(policy.sources[1]!.domain);
    expect(selectedWebResources(policy).map((source) => source.id)).toEqual([
      'quranpedia',
      'dorar',
      'shamela',
      'binbaz',
    ]);
  });

  it('distinguishes bounded corpus references from web selection and per-excerpt approval', () => {
    render(<SourceInformation />);
    const lists = screen.getAllByRole('list');
    expect(within(lists[0]!).getAllByRole('listitem')).toHaveLength(7);
    for (const name of [
      'القرآن الكريم',
      'التفسير الميسر',
      'تيسير الكريم الرحمن',
      'صحيح البخاري',
      'صحيح مسلم',
      'سنن أبي داود',
      'محاسن التوحيد وارتباطها بأركان الإيمان',
    ]) {
      expect(within(lists[0]!).getByText(name)).toBeTruthy();
    }
    expect(
      within(lists[1]!)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(selectedWebResources().map((source) => `https://${source.domain}/`));
    expect(within(lists[1]!).getAllByText(/من قائمة مراجع التحدي/)).toHaveLength(5);
    expect(within(lists[1]!).getAllByText(/مختار للمشروع/)).toHaveLength(1);
    expect(screen.getByText(/لا يعني اعتماد كل/)).toBeTruthy();
    expect(screen.getByText(/لا تمثل إتاحة جميع هذه الكتب كاملة/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'المراجعة البشرية وتحديث المعرفة' })).toBeTruthy();
  });
});
