import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../messages/en.json';

const { submitBetaFeedbackAction } = vi.hoisted(() => ({ submitBetaFeedbackAction: vi.fn() }));
vi.mock('@/app/[locale]/(student)/actions/feedback', () => ({ submitBetaFeedbackAction }));

const { FeedbackButton } = await import('@/app/[locale]/(student)/_components/feedback-button');
const { FeedbackDialog } = await import('@/app/[locale]/(student)/_components/feedback-dialog');

// jsdom has HTMLDialogElement but no modal behaviour: the minimum the dialog
// relies on (open state, the close event). Esc and the focus trap are the browser's.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  submitBetaFeedbackAction.mockResolvedValue({ ok: true, value: undefined });
  window.history.replaceState(null, '', '/en/dashboard?tab=grammar');
});

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <FeedbackButton />
    </NextIntlClientProvider>,
  );
}

const dialog = () => document.querySelector('dialog') as HTMLDialogElement;
const textarea = () => screen.getByRole('textbox', { name: en.feedback.textLabel });
const send = () => screen.getByRole('button', { name: en.feedback.submit });
const openDialog = () => fireEvent.click(screen.getByRole('button', { name: en.feedback.trigger }));
const type = (value: string) => fireEvent.change(textarea(), { target: { value } });

describe('FeedbackDialog', () => {
  it('the trigger opens a blank form: "Something else" chosen, Send disabled', () => {
    renderButton();
    expect(dialog().open).toBe(false);
    openDialog();
    expect(dialog().open).toBe(true);
    expect(screen.getByRole('heading', { name: en.feedback.title })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: en.feedback.kinds.other })).toBeChecked();
    expect(textarea()).toHaveValue('');
    expect(send()).toBeDisabled();
  });

  it('counts characters and needs at least 5 that are not spaces', () => {
    renderButton();
    openDialog();
    expect(screen.getByText('0 / 1000 characters')).toBeInTheDocument();
    type('  abcd  ');
    expect(screen.getByText('8 / 1000 characters')).toBeInTheDocument();
    expect(send()).toBeDisabled();
    type('abcde');
    expect(send()).toBeEnabled();
    expect(textarea()).toHaveAttribute('maxLength', '1000');
  });

  it('sends the kind, the text and the page (path + query, no origin)', async () => {
    renderButton();
    openDialog();
    fireEvent.click(screen.getByRole('radio', { name: en.feedback.kinds.bug }));
    type('The Continue button does nothing');
    fireEvent.click(send());
    await screen.findByRole('status');
    expect(submitBetaFeedbackAction).toHaveBeenCalledTimes(1);
    expect(submitBetaFeedbackAction).toHaveBeenCalledWith({
      kind: 'BUG',
      text: 'The Continue button does nothing',
      url: '/en/dashboard?tab=grammar',
    });
  });

  it('a report opened on a word card sends its vocabRef, nothing else about the word', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FeedbackDialog open onClose={() => {}} vocabRef="opaque-vocab-ref" />
      </NextIntlClientProvider>,
    );
    type('The translation is wrong');
    fireEvent.click(send());
    await screen.findByRole('status');
    expect(submitBetaFeedbackAction).toHaveBeenCalledWith({
      kind: 'CONTENT_ERROR',
      text: 'The translation is wrong',
      url: '/en/dashboard?tab=grammar',
      vocabRef: 'opaque-vocab-ref',
    });
  });

  it('thanks the learner on success; Close closes the dialog', async () => {
    renderButton();
    openDialog();
    type('Great app so far');
    fireEvent.click(send());
    expect(await screen.findByRole('status')).toHaveTextContent(en.feedback.successMessage);
    fireEvent.click(screen.getByRole('button', { name: en.feedback.close }));
    expect(dialog().open).toBe(false);
  });

  it.each([
    [
      'an error result',
      () => submitBetaFeedbackAction.mockResolvedValueOnce({ ok: false, error: 'INTERNAL_ERROR' }),
    ],
    ['no reply', () => submitBetaFeedbackAction.mockRejectedValueOnce(new Error('network'))],
  ])('on %s: an inline error, the text kept, and Send retries', async (_, fail) => {
    fail();
    renderButton();
    openDialog();
    type('Typo in the second question');
    fireEvent.click(send());
    expect(await screen.findByRole('alert')).toHaveTextContent(en.feedback.errorMessage);
    expect(textarea()).toHaveValue('Typo in the second question');
    expect(send()).toBeEnabled();

    fireEvent.click(send());
    expect(await screen.findByRole('status')).toHaveTextContent(en.feedback.successMessage);
    expect(submitBetaFeedbackAction).toHaveBeenCalledTimes(2);
  });

  it('a double submit in the same tick sends once', async () => {
    renderButton();
    openDialog();
    type('Sent twice by accident');
    const form = textarea().closest('form') as HTMLFormElement;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
    });
    await screen.findByRole('status');
    expect(submitBetaFeedbackAction).toHaveBeenCalledTimes(1);
  });

  it('keys typed in the dialog never reach the page underneath', () => {
    const onPageKey = vi.fn();
    window.addEventListener('keydown', onPageKey);
    renderButton();
    openDialog();
    fireEvent.keyDown(textarea(), { key: 'Escape' });
    fireEvent.keyDown(textarea(), { key: '1' });
    window.removeEventListener('keydown', onPageKey);
    expect(onPageKey).not.toHaveBeenCalled();
  });

  it('every open starts blank, even after a sent report', async () => {
    renderButton();
    openDialog();
    fireEvent.click(screen.getByRole('radio', { name: en.feedback.kinds.bug }));
    type('First report text');
    fireEvent.click(send());
    await screen.findByRole('status');
    fireEvent.click(screen.getByRole('button', { name: en.feedback.close }));

    openDialog();
    expect(textarea()).toHaveValue('');
    expect(screen.getByRole('radio', { name: en.feedback.kinds.other })).toBeChecked();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Cancel closes without sending', () => {
    const onClose = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FeedbackDialog open onClose={onClose} />
      </NextIntlClientProvider>,
    );
    // Content error is the default kind.
    expect(screen.getByRole('radio', { name: en.feedback.kinds.contentError })).toBeChecked();
    type('Never sent');
    fireEvent.click(screen.getByRole('button', { name: en.feedback.cancel }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(submitBetaFeedbackAction).not.toHaveBeenCalled();
  });
});
