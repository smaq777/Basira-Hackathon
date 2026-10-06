// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
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
    const references = within(screen.getByRole('region', { name: 'المراجع النصية' }));
    const websites = within(screen.getByRole('region', { name: 'مواقع البحث المختارة' }));
    expect(references.getAllByRole('listitem')).toHaveLength(7);
    expect(references.getByRole('list', { name: 'القرآن والتفسير' })).toBeTruthy();
    expect(references.getByRole('list', { name: 'الحديث' })).toBeTruthy();
    expect(references.getByRole('list', { name: 'العقيدة' })).toBeTruthy();
    for (const name of [
      'القرآن الكريم',
      'التفسير الميسر',
      'تيسير الكريم الرحمن',
      'صحيح البخاري',
      'صحيح مسلم',
      'سنن أبي داود',
      'محاسن التوحيد وارتباطها بأركان الإيمان',
    ]) {
      expect(references.getByText(name)).toBeTruthy();
    }
    const hadithDataset =
      'https://github.com/Watheq9/IslamicEval2026/blob/8ca8abb8a0f0d96a5ab07d48108e35b7e02d236e/Corpora/six_hadith_books.json';
    expect(references.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      'https://tanzil.net/pub/download/index.php?quranType=uthmani&outType=xml&marks=true&sajdah=true&tatweel=true&agree=true',
      'https://qurancomplex.gov.sa/quran-dev/',
      'https://github.com/tafsircenter/tafsir-mcp',
      hadithDataset,
      hadithDataset,
      hadithDataset,
      'https://shamela.ws/book/30015/195',
    ]);
    expect(references.getAllByText('مجموعة البيانات المستخدمة — نسخة مثبتة')).toHaveLength(3);
    expect(websites.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
      selectedWebResources().map((source) => `https://${source.domain}/`),
    );
    expect(websites.getAllByText(/من قائمة مراجع التحدي/)).toHaveLength(5);
    expect(websites.getAllByText(/مختار للمشروع/)).toHaveLength(1);
    expect(screen.getByText(/لا يعني اعتماد كل/)).toBeTruthy();
    expect(screen.getByText(/لا تمثل إتاحة جميع هذه الكتب كاملة/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'المراجعة البشرية وتحديث المعرفة' })).toBeTruthy();
  });

  it('keeps the full source explanations available in expandable sections', async () => {
    const user = userEvent.setup();
    render(<SourceInformation />);
    const summary = screen.getByRole('heading', { name: 'خادم التفسير MCP' });
    const disclosure = summary.closest('details');
    expect(disclosure?.open).toBe(false);
    await user.click(summary);
    expect(disclosure?.open).toBe(true);
    expect(screen.getByRole('link', { name: 'المشروع المرجعي لخادم التفسير' })).toHaveProperty(
      'href',
      'https://github.com/tafsircenter/tafsir-mcp',
    );
    expect(screen.getByText(/search_quran_text/)).toBeTruthy();
    await user.click(summary);
    expect(disclosure?.open).toBe(false);
  });
});
