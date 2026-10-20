import { prisma } from '@englishlearn/db';
import { requireRole } from '@/lib/authz';

export default async function UsersAdminPage() {
  await requireRole('ADMIN');

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Users</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-line text-sm">
          <thead className="bg-surface-2">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-ink-muted">Email</th>
              <th className="px-4 py-2 text-left font-medium text-ink-muted">Name</th>
              <th className="px-4 py-2 text-left font-medium text-ink-muted">Role</th>
              <th className="px-4 py-2 text-left font-medium text-ink-muted">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line bg-surface">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.name ?? '—'}</td>
                <td className="px-4 py-2">{u.role}</td>
                <td className="px-4 py-2">{u.createdAt.toISOString().slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
