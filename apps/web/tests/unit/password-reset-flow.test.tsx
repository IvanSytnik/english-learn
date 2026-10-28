import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';

const { requestPasswordResetAction, resetPasswordAction, replace, login } = vi.hoisted(() => ({
  requestPasswordResetAction: vi.fn(),
  resetPasswordAction: vi.fn(),
  replace: vi.fn(),
  login: vi.fn(),
}));
vi.mock('@/app/[locale]/(auth)/forgot-password/actions', () => ({ requestPasswordResetAction }));
vi.mock('@/app/[locale]/(auth)/reset-password/actions', () => ({ resetPasswordAction }));
vi.mock('@/app/[locale]/(auth)/login/actions', () => ({ login }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: unknown; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : JSON.stringify(href)} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace }),
}));

const { ForgotPasswordForm } = await import(
  '@/app/[locale]/(auth)/forgot-password/forgot-password-form'
);
const { ResetPasswordForm } = await import(
  '@/app/[locale]/(auth)/reset-password/reset-password-form'
);
const { LoginForm } = await import('@/app/[locale]/(auth)/login/login-form');

const withIntl = (ui: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ForgotPasswordForm', () => {
  const email = () => screen.getByLabelText(en.auth.forgot.email);
  const submit = () => screen.getByRole('button', { name: en.auth.forgot.submit });

  it('shows the neutral confirmation and moves focus to it', async () => {
    requestPasswordResetAction.mockResolvedValue({ ok: true, value: { success: true } });
    withIntl(<ForgotPasswordForm />);

    fireEvent.change(email(), { target: { value: 'ada@example.com' } });
    fireEvent.click(submit());

    const heading = await screen.findByRole('heading', { name: en.auth.forgot.sentTitle });
    expect(screen.getByRole('status')).toHaveTextContent(en.auth.forgot.sentBody);
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(requestPasswordResetAction).toHaveBeenCalledWith({ email: 'ada@example.com' });
    expect(screen.getByRole('link', { name: en.auth.forgot.backToLogin })).toHaveAttribute(
      'href',
      '/login',
    );
  });

  it('sends once on a double submit', async () => {
    let resolve: (v: unknown) => void = () => {};
    requestPasswordResetAction.mockReturnValue(new Promise((r) => (resolve = r)));
    withIntl(<ForgotPasswordForm />);

    fireEvent.change(email(), { target: { value: 'ada@example.com' } });
    const form = submit().closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(await screen.findByRole('button', { name: en.auth.forgot.sending })).toBeDisabled();
    resolve({ ok: true, value: { success: true } });
    await screen.findByRole('heading', { name: en.auth.forgot.sentTitle });
    expect(requestPasswordResetAction).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['RATE_LIMITED', en.auth.forgot.errors.rateLimited],
    ['INVALID_EMAIL', en.auth.forgot.errors.invalidEmail],
    ['FAILED', en.auth.forgot.errors.generic],
  ])('shows %s as an alert and keeps the email', async (error, message) => {
    requestPasswordResetAction.mockResolvedValue({ ok: false, error });
    withIntl(<ForgotPasswordForm />);

    fireEvent.change(email(), { target: { value: 'ada@example.com' } });
    fireEvent.click(submit());

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(email()).toHaveValue('ada@example.com');
  });

  it('offers a retry when the action throws', async () => {
    requestPasswordResetAction
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: true, value: { success: true } });
    withIntl(<ForgotPasswordForm />);

    fireEvent.change(email(), { target: { value: 'ada@example.com' } });
    fireEvent.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(en.auth.forgot.errors.generic);

    fireEvent.click(submit());
    expect(await screen.findByRole('heading', { name: en.auth.forgot.sentTitle })).toBeVisible();
  });
});

describe('ResetPasswordForm', () => {
  const TOKEN = 'a'.repeat(64);
  const fill = (password: string, confirm = password) => {
    fireEvent.change(screen.getByLabelText(en.auth.reset.password), {
      target: { value: password },
    });
    fireEvent.change(screen.getByLabelText(en.auth.reset.confirm), {
      target: { value: confirm },
    });
    fireEvent.click(screen.getByRole('button', { name: en.auth.reset.submit }));
  };

  it('changes the password and goes to sign-in with the success flag', async () => {
    resetPasswordAction.mockResolvedValue({ ok: true, value: { success: true } });
    withIntl(<ResetPasswordForm token={TOKEN} email="ada@example.com" />);

    fill('new-password-1');

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith({ pathname: '/login', query: { reset: '1' } }),
    );
    expect(resetPasswordAction).toHaveBeenCalledWith({
      token: TOKEN,
      email: 'ada@example.com',
      password: 'new-password-1',
    });
  });

  it('checks length and confirmation before calling the server', () => {
    withIntl(<ResetPasswordForm token={TOKEN} email="ada@example.com" />);

    fill('short');
    expect(screen.getByText(en.auth.reset.errors.tooShort)).toBeVisible();
    expect(screen.getByLabelText(en.auth.reset.password)).toHaveAttribute('aria-invalid', 'true');

    fill('long-enough-1', 'long-enough-2');
    expect(screen.getByText(en.auth.reset.errors.mismatch)).toBeVisible();
    expect(screen.getByLabelText(en.auth.reset.confirm)).toHaveAttribute('aria-invalid', 'true');

    expect(resetPasswordAction).not.toHaveBeenCalled();
  });

  it('explains a dead link and offers a new one', async () => {
    resetPasswordAction.mockResolvedValue({ ok: false, error: 'INVALID_TOKEN' });
    withIntl(<ResetPasswordForm token={TOKEN} email="ada@example.com" />);

    fill('new-password-1');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(en.auth.reset.errors.invalidToken);
    expect(screen.getByRole('link', { name: en.auth.reset.requestNew })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps the fields and allows a retry when the action throws', async () => {
    resetPasswordAction
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ ok: true, value: { success: true } });
    withIntl(<ResetPasswordForm token={TOKEN} email="ada@example.com" />);

    fill('new-password-1');
    expect(await screen.findByRole('alert')).toHaveTextContent(en.auth.reset.errors.generic);
    expect(screen.getByLabelText(en.auth.reset.password)).toHaveValue('new-password-1');

    fireEvent.click(screen.getByRole('button', { name: en.auth.reset.submit }));
    await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
  });
});

describe('LoginForm', () => {
  it('confirms a finished reset and links to the forgot page', () => {
    withIntl(<LoginForm passwordReset />);

    expect(screen.getByRole('status')).toHaveTextContent(en.auth.login.resetDone);
    expect(screen.getByRole('link', { name: en.auth.login.forgotPassword })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('shows no reset confirmation on a plain visit', () => {
    withIntl(<LoginForm />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
