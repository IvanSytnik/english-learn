import { requireRole } from '@/lib/authz';

export default async function Page() {
  await requireRole('ADMIN');

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">diagnostic (admin)</h1>
      <p className="text-gray-600">CRUD UI is implemented in the next phase.</p>
    </div>
  );
}
