import 'server-only';
import { createTranslator } from 'next-intl';
import { Resend } from 'resend';
import { defaultLocale, locales } from '@/i18n/config';
import { env } from '@/lib/env';
import de from '@/messages/de.json';
import en from '@/messages/en.json';
import ru from '@/messages/ru.json';
import uk from '@/messages/uk.json';

type Locale = (typeof locales)[number];
const MESSAGES = { en, ru, uk, de } as const;

export type PasswordResetEmail = { to: string; url: string; locale: string };

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

function toLocale(locale: string): Locale {
  return (locales as readonly string[]).includes(locale) ? (locale as Locale) : defaultLocale;
}

/** Subject, plain text and HTML of the reset email in `locale` (unknown → English). */
export function renderPasswordResetEmail({ url, locale }: Omit<PasswordResetEmail, 'to'>) {
  const lang = toLocale(locale);
  const t = createTranslator({
    locale: lang,
    messages: MESSAGES[lang],
    namespace: 'email.passwordReset',
  });
  const text = [t('intro'), '', url, '', t('expiry'), t('ignore')].join('\n');
  const p = (s: string) => `<p>${escapeHtml(s)}</p>`;
  const html = `<!doctype html>
<html lang="${lang}"><body style="font-family:system-ui,sans-serif;line-height:1.5">
${p(t('intro'))}
<p><a href="${escapeHtml(url)}">${escapeHtml(t('action'))}</a></p>
${p(t('expiry'))}
${p(t('ignore'))}
</body></html>`;
  return { subject: t('subject'), text, html };
}

/**
 * Send the reset email. Without RESEND_API_KEY nothing is sent: outside
 * production the link is logged for local testing; in production only a
 * warning is, since the link is a live credential. Never throws — the caller
 * runs after the response and has nobody to report to.
 */
export async function sendPasswordResetEmail(mail: PasswordResetEmail): Promise<void> {
  const { subject, text, html } = renderPasswordResetEmail(mail);
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      console.error('RESEND_API_KEY is not set: password reset email not sent');
    } else {
      console.info(`[mailer] password reset for ${mail.to}: ${mail.url}`);
    }
    return;
  }
  try {
    const { error } = await new Resend(env.RESEND_API_KEY).emails.send({
      from: env.EMAIL_FROM,
      to: mail.to,
      subject,
      text,
      html,
    });
    if (error) console.error('password reset email failed', error.name);
  } catch (err) {
    console.error('password reset email failed', err);
  }
}
