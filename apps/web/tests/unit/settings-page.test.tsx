import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';

const {
  auth,
  redirect,
  replace,
  refresh,
  getNativeLanguage,
  updateNativeLanguageAction,
  exportUserDataAction,
  deleteAccountAction,
} = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((_: { href: string; locale: string }) => {
    throw new Error('NEXT_REDIRECT');
  }),
  replace: vi.fn(),
  refresh: vi.fn(),
  getNativeLanguage: vi.fn(),
  updateNativeLanguageAction: vi.fn(),
  exportUserDataAction: vi.fn(),
  deleteAccountAction: vi.fn(),
}));

/** `settings.export.title` → the English message, as next-intl/server would give. */
function translator(namespace: string) {
  return (key: string) =>
    `${namespace}.${key}`
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
}

vi.mock('server-only', () => ({}));
vi.mock('@englishlearn/db', () => ({ prisma: { tag: 'prisma' } }));
vi.mock('@englishlearn/db/queries/student-profile', () => ({ getNativeLanguage }));
vi.mock('@/lib/auth', () => ({ auth }));
vi.mock('@/app/_components/footer', () => ({ Footer: () => null }));
vi.mock('@/i18n/navigation', () => ({
  redirect,
  useRouter: () => ({ replace, refresh }),
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace: string) => translator(namespace),
}));
vi.mock('@/app/[locale]/(student)/settings/actions', () => ({
  updateNativeLanguageAction,
  exportUserDataAction,
  deleteAccountAction,
}));

const { default: SettingsPage } = await import('@/app/[locale]/(student)/settings/page');

const s = en.settings;
const PAYLOAD = { user: { id: 'user-1', email: 'ada@test.local' }, learnerEvents: [] };

// jsdom has HTMLDialogElement but no modal behaviour: the minimum the dialog
// relies on (open state). Esc, the focus trap and focus return are the browser's.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

let blobs: Blob[];
let clicked: { download: string; href: string }[];

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks keeps queued *Once values: one a failed test never used
  // would answer the next test's call.
  for (const action of [updateNativeLanguageAction, exportUserDataAction, deleteAccountAction]) {
    action.mockReset();
  }
  auth.mockResolvedValue({ user: { id: 'user-1', role: 'STUDENT' } });
  getNativeLanguage.mockResolvedValue('uk');
  updateNativeLanguageAction.mockResolvedValue({ ok: true, value: { success: true } });
  exportUserDataAction.mockResolvedValue({ ok: true, value: PAYLOAD });
  deleteAccountAction.mockResolvedValue({ ok: true, value: { success: true } });

  blobs = [];
  clicked = [];
  URL.createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return 'blob:export';
  });
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push({ download: this.download, href: this.getAttribute('href') ?? '' });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function renderPage() {
  const page = await SettingsPage();
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {page}
    </NextIntlClientProvider>,
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });
const dialog = () => document.querySelector('dialog') as HTMLDialogElement;
const password = () => screen.getByLabelText(s.dangerZone.passwordLabel);
const confirmDelete = () => screen.getByRole('button', { name: s.dangerZone.confirmDeleteButton });
const openDelete = () =>
  fireEvent.click(screen.getByRole('button', { name: s.dangerZone.deleteButton }));

describe('/settings page', () => {
  it('sends a signed-out visitor to /login', async () => {
    auth.mockResolvedValue(null);
    await expect(SettingsPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirect).toHaveBeenCalledWith({ href: '/login', locale: 'en' });
  });

  it('shows a student all three sections, with the stored language chosen', async () => {
    await renderPage();

    expect(screen.getByRole('heading', { level: 1, name: s.title })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: s.language.title })).toBeInTheDocument();
    expect(radio('Українська')).toBeChecked();
    expect(screen.getByRole('button', { name: s.export.downloadButton })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: s.dangerZone.deleteButton })).toBeInTheDocument();
    expect(getNativeLanguage).toHaveBeenCalledWith({ tag: 'prisma' }, 'user-1');
  });

  it('chooses nothing when the stored value is not a supported language', async () => {
    getNativeLanguage.mockResolvedValue('pl');
    await renderPage();
    for (const r of screen.getAllByRole('radio')) expect(r).not.toBeChecked();
    expect(screen.getByRole('button', { name: s.language.saveButton })).toBeDisabled();
  });

  it('shows a non-student export and deletion, but no language (it has no profile)', async () => {
    auth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } });
    await renderPage();

    expect(screen.queryByRole('group', { name: s.language.title })).not.toBeInTheDocument();
    expect(getNativeLanguage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: s.export.downloadButton })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: s.dangerZone.deleteButton })).toBeInTheDocument();
  });
});

describe('native language', () => {
  it('saves the new choice and says so', async () => {
    await renderPage();
    fireEvent.click(radio('Deutsch'));
    fireEvent.click(screen.getByRole('button', { name: s.language.saveButton }));

    expect(await screen.findByRole('status')).toHaveTextContent(s.language.successMessage);
    expect(updateNativeLanguageAction).toHaveBeenCalledTimes(1);
    expect(updateNativeLanguageAction).toHaveBeenCalledWith({ language: 'de' });
  });

  it('reports a refused or lost save, keeping the choice', async () => {
    updateNativeLanguageAction.mockResolvedValueOnce({ ok: false, error: 'INTERNAL_ERROR' });
    await renderPage();
    fireEvent.click(radio(s.language.other));
    fireEvent.click(screen.getByRole('button', { name: s.language.saveButton }));
    expect(await screen.findByRole('alert')).toHaveTextContent(s.language.errorMessage);
    // The alert commits before the transition ends; Save is disabled until it does.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: s.language.saveButton })).toBeEnabled(),
    );

    updateNativeLanguageAction.mockRejectedValueOnce(new Error('network'));
    fireEvent.click(screen.getByRole('button', { name: s.language.saveButton }));
    await waitFor(() => expect(updateNativeLanguageAction).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('alert')).toHaveTextContent(s.language.errorMessage);
    expect(radio(s.language.other)).toBeChecked();
  });
});

describe('data export', () => {
  it('downloads the export as englishlearn-data-<userId>.json', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: s.export.downloadButton }));

    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(exportUserDataAction).toHaveBeenCalledTimes(1);
    expect(clicked[0]).toEqual({ download: 'englishlearn-data-user-1.json', href: 'blob:export' });
    expect(blobs[0]?.type).toBe('application/json');
    expect(JSON.parse(await (blobs[0] as Blob).text())).toEqual(PAYLOAD);
  });

  it('downloads nothing and says so when the export fails', async () => {
    exportUserDataAction.mockResolvedValue({ ok: false, error: 'INTERNAL_ERROR' });
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: s.export.downloadButton }));

    expect(await screen.findByRole('alert')).toHaveTextContent(s.export.errorMessage);
    expect(clicked).toEqual([]);
  });

  it('sends one request for a double click', async () => {
    await renderPage();
    const button = screen.getByRole('button', { name: s.export.downloadButton });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    await waitFor(() => expect(clicked).toHaveLength(1));
    expect(exportUserDataAction).toHaveBeenCalledTimes(1);
  });
});

describe('account deletion', () => {
  it('asks for the password in a modal dialog before anything is sent', async () => {
    await renderPage();
    expect(dialog().open).toBe(false);
    openDelete();

    expect(dialog().open).toBe(true);
    expect(
      within(dialog()).getByRole('heading', { name: s.dangerZone.dialogTitle }),
    ).toBeInTheDocument();
    expect(password()).toHaveAttribute('type', 'password');
    expect(deleteAccountAction).not.toHaveBeenCalled();
  });

  it('reports a wrong password inline and stays open', async () => {
    deleteAccountAction.mockResolvedValue({ ok: false, error: 'INVALID_PASSWORD' });
    await renderPage();
    openDelete();
    fireEvent.change(password(), { target: { value: 'wrong' } });
    fireEvent.click(confirmDelete());

    expect(await screen.findByRole('alert')).toHaveTextContent(s.dangerZone.invalidPasswordError);
    expect(deleteAccountAction).toHaveBeenCalledWith({ password: 'wrong' });
    expect(password()).toHaveAttribute('aria-invalid', 'true');
    expect(dialog().open).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });

  it('reports throttling and other failures with their own message', async () => {
    deleteAccountAction.mockResolvedValueOnce({ ok: false, error: 'RATE_LIMITED' });
    await renderPage();
    openDelete();
    fireEvent.change(password(), { target: { value: 'pw' } });
    fireEvent.click(confirmDelete());
    expect(await screen.findByRole('alert')).toHaveTextContent(s.dangerZone.rateLimitedError);
    // The alert commits before the transition ends; the button is disabled until it does.
    await waitFor(() => expect(confirmDelete()).toBeEnabled());

    deleteAccountAction.mockRejectedValueOnce(new Error('network'));
    fireEvent.click(confirmDelete());
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(s.dangerZone.errorMessage),
    );
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends nothing without a password', async () => {
    await renderPage();
    openDelete();
    fireEvent.click(confirmDelete());

    expect(screen.getByRole('alert')).toHaveTextContent(s.dangerZone.invalidPasswordError);
    expect(deleteAccountAction).not.toHaveBeenCalled();
  });

  it('goes to the home page once the account is deleted', async () => {
    await renderPage();
    openDelete();
    fireEvent.change(password(), { target: { value: 'correct horse' } });
    fireEvent.click(confirmDelete());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(refresh).toHaveBeenCalled();
    expect(deleteAccountAction).toHaveBeenCalledTimes(1);
  });

  it('sends one request for a double submit', async () => {
    await renderPage();
    openDelete();
    fireEvent.change(password(), { target: { value: 'correct horse' } });
    act(() => {
      fireEvent.click(confirmDelete());
      fireEvent.click(confirmDelete());
    });
    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(deleteAccountAction).toHaveBeenCalledTimes(1);
  });

  it('Cancel closes the dialog without sending', async () => {
    await renderPage();
    openDelete();
    fireEvent.click(within(dialog()).getByRole('button', { name: s.dangerZone.cancelButton }));
    expect(dialog().open).toBe(false);
    expect(deleteAccountAction).not.toHaveBeenCalled();
  });
});
