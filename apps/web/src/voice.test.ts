import { describe, expect, it } from 'vitest';
import { answerReviewQuestion, VOICE_GREETING } from './voice.js';

describe('session-grounded Arabic voice replies', () => {
  it('introduces the evidence boundary in the spoken greeting', () => {
    expect(VOICE_GREETING).toContain('هذه المراجعة');
    expect(VOICE_GREETING).toContain('الأدلة الظاهرة');
  });

  it('answers source questions only from the displayed source', () => {
    expect(answerReviewQuestion('ما المصدر؟', 'result')).toContain('البقرة');
    expect(answerReviewQuestion('ما المصدر؟', 'result')).toContain('لا أستند هنا إلى مصدر آخر');
  });

  it('keeps resolved and unresolved explanations distinct', () => {
    expect(answerReviewQuestion('ليش النتيجة؟', 'result')).toContain('صياغة أضيق');
    expect(answerReviewQuestion('ليش النتيجة غير محسومة؟', 'unresolved')).toContain(
      'دون حكم نهائي',
    );
  });

  it('declines questions outside the current review session', () => {
    const answer = answerReviewQuestion('ما حكم موضوع آخر؟', 'result');
    expect(answer).toContain('لا أجيب عن فتوى');
    expect(answer).toContain('خارج ملف المراجعة');
  });
});
