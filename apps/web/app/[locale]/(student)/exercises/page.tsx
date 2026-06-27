import { publishedExercises } from '@englishlearn/db/queries/exercises';
import { Card, CardContent, CardHeader, CardTitle } from '@englishlearn/ui';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { auth } from '@/lib/auth';

export default async function ExercisesPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const t = await getTranslations('student.exercises');

  const [vocab, grammar] = await Promise.all([
    publishedExercises.vocab.findMany({ take: 5 }),
    publishedExercises.grammar.findMany({ take: 5 }),
  ]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">{t('title')}</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">Vocabulary</h2>
        <div className="space-y-3">
          {vocab.map((ex) => (
            <Card key={ex.id}>
              <CardHeader>
                <CardTitle className="text-base">{ex.prompt}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-disc pl-5 text-sm text-gray-700">
                  {ex.choices.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
          {vocab.length === 0 && <p className="text-gray-500">No exercises yet. Seed the db.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Grammar</h2>
        <div className="space-y-3">
          {grammar.map((ex) => (
            <Card key={ex.id}>
              <CardHeader>
                <CardTitle className="text-base">{ex.template}</CardTitle>
              </CardHeader>
              <CardContent>
                {ex.hint && <p className="text-sm text-gray-600">Hint: {ex.hint}</p>}
              </CardContent>
            </Card>
          ))}
          {grammar.length === 0 && <p className="text-gray-500">No exercises yet. Seed the db.</p>}
        </div>
      </section>
    </main>
  );
}
