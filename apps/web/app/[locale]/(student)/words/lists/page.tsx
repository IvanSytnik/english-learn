import { PASTE_MAX_CHARS } from '@englishlearn/learner-model';
import { Footer } from '@/app/_components/footer';
import { requireRole } from '@/lib/authz';
import { loadWordListsIndex } from '@/lib/word-lists';
import { ListsIndex } from './_components/lists-index';
import { PasteImport } from './_components/paste-import';

/**
 * `/words/lists` (B6.7): the learner's word lists — active ones with their
 * counts and stages, a new list, archived ones collapsed with Restore.
 */
export default async function WordListsPage() {
  // Lists hold words of the learner model, which only students have.
  const user = await requireRole('STUDENT');
  const view = await loadWordListsIndex(user.id);
  return (
    <>
      <ListsIndex
        view={view}
        pasteImport={<PasteImport target={{ newList: true }} maxChars={PASTE_MAX_CHARS} />}
      />
      <Footer />
    </>
  );
}
