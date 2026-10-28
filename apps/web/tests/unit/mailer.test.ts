import { afterEach, describe, expect, it, vi } from 'vitest';

const { env, send, Resend } = vi.hoisted(() => {
  const send = vi.fn();
  return {
    env: {
      RESEND_API_KEY: undefined as string | undefined,
      EMAIL_FROM: 'EnglishLearn <noreply@sytnik-studio.com>',
      NODE_ENV: 'test',
    },
    send,
    Resend: vi.fn(function Resend() {
      return { emails: { send } };
    }),
  };
});
vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ env }));
vi.mock('resend', () => ({ Resend }));

const { renderPasswordResetEmail, sendPasswordResetEmail } = await import('@/lib/email/mailer');
const en = (await import('../../messages/en.json')).default;
const ru = (await import('../../messages/ru.json')).default;

const URL = 'https://app.example/reset-password?token=abc&email=a%40b.c';

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  env.RESEND_API_KEY = undefined;
  env.NODE_ENV = 'test';
});

describe('renderPasswordResetEmail', () => {
  it.each(['en', 'ru', 'uk', 'de'])('%s: subject, link in text and HTML', (locale) => {
    const mail = renderPasswordResetEmail({ url: URL, locale });
    expect(mail.subject).not.toBe('');
    expect(mail.text).toContain(URL);
    expect(mail.html).toContain(`href="${URL.replaceAll('&', '&amp;')}"`);
    expect(mail.html).toContain(`<html lang="${locale}">`);
  });

  it('uses the requested language and falls back to English', () => {
    expect(renderPasswordResetEmail({ url: URL, locale: 'ru' }).subject).toBe(
      ru.email.passwordReset.subject,
    );
    expect(renderPasswordResetEmail({ url: URL, locale: 'fr' }).subject).toBe(
      en.email.passwordReset.subject,
    );
  });

  it('escapes the link in HTML', () => {
    const { html } = renderPasswordResetEmail({ url: 'https://x/"><script>', locale: 'en' });
    expect(html).not.toContain('<script>');
  });
});

describe('sendPasswordResetEmail', () => {
  const mail = { to: 'ada@example.com', url: URL, locale: 'en' };

  it('logs the link instead of sending when no API key is set', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await sendPasswordResetEmail(mail);
    expect(info).toHaveBeenCalledWith(expect.stringContaining(URL));
    expect(Resend).not.toHaveBeenCalled();
  });

  it('never logs the link in production', async () => {
    env.NODE_ENV = 'production';
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await sendPasswordResetEmail(mail);
    expect(info).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('token=');
  });

  it('sends through Resend when a key is set', async () => {
    env.RESEND_API_KEY = 're_test';
    send.mockResolvedValue({ data: { id: '1' }, error: null });
    await sendPasswordResetEmail(mail);
    expect(Resend).toHaveBeenCalledWith('re_test');
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: env.EMAIL_FROM,
        to: 'ada@example.com',
        subject: en.email.passwordReset.subject,
      }),
    );
  });

  it('does not throw when Resend fails', async () => {
    env.RESEND_API_KEY = 're_test';
    send.mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(sendPasswordResetEmail(mail)).resolves.toBeUndefined();
  });
});
