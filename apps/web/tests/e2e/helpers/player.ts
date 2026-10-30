import { expect, type Page } from '@playwright/test';
import { AFTER_SUBMIT } from './auth';

/** The rule card that opens a new grammar topic (B3.2). */
export const ruleCard = (page: Page) => page.locator('[data-theory-intro]');

/**
 * Get past the rule card if the topic on screen opens with one: which topic
 * comes first is Thompson's pick, not the test's. Keyboard only — Enter, once
 * the card's button holds focus (then the player's listener is current).
 */
export async function toQuestion(page: Page) {
  const card = ruleCard(page);
  const prompt = page.locator('#exercise-prompt');
  await expect(card.or(prompt)).toBeVisible(AFTER_SUBMIT);
  if (!(await card.isVisible())) return;
  await expect(card.getByRole('button')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(prompt).toBeVisible(AFTER_SUBMIT);
}
