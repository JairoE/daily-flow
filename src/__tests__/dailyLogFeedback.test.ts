import { getDailyLogSuccessMessage } from '../lib/dailyLogFeedback';

describe('daily log feedback', () => {
  it('thanks the user after any daily bowel movement entry', () => {
    expect(getDailyLogSuccessMessage()).toBe(
      'Thank you for taking another step toward a healthier you.',
    );
  });
});
