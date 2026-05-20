import { requireAdmin } from "../../../lib/session";
import { prisma } from "../../../lib/prisma";
import { revalidatePath } from "next/cache";
import { sendUserApprovedEmail } from "@mimix/orchestrator";

async function approveUser(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = formData.get("id") as string;
  const updated = await prisma.user.update({
    where: { id },
    data: { status: "APPROVED" },
  });
  if (updated.email) {
    sendUserApprovedEmail({ to: updated.email }).catch((e) =>
      console.error("[admin] approval email failed:", e),
    );
  }
  revalidatePath("/admin/users");
}

async function banUser(formData: FormData) {
  "use server";
  await requireAdmin();
  const id = formData.get("id") as string;
  await prisma.user.update({ where: { id }, data: { status: "BANNED" } });
  revalidatePath("/admin/users");
}

export default async function AdminUsersPage() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const pending = users.filter((u) => u.status === "PENDING");
  const approved = users.filter((u) => u.status === "APPROVED");
  const banned = users.filter((u) => u.status === "BANNED");

  return (
    <div className="max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Users</h1>
      <p className="text-sm text-slate-500 mb-8">
        {pending.length} pending · {approved.length} approved · {banned.length} banned
      </p>

      <Section title={`Pending (${pending.length})`} users={pending} actions />
      <Section title={`Approved (${approved.length})`} users={approved} />
      {banned.length > 0 && <Section title={`Banned (${banned.length})`} users={banned} />}
    </div>
  );

  function Section({
    title,
    users,
    actions,
  }: {
    title: string;
    users: typeof pending;
    actions?: boolean;
  }) {
    if (users.length === 0) return null;
    return (
      <div className="mb-8">
        <h2 className="text-lg font-semibold mb-2">{title}</h2>
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
          {users.map((u) => (
            <li key={u.id} className="px-4 py-3 flex justify-between items-center">
              <div>
                <div className="font-medium">{u.email}</div>
                <div className="text-xs text-slate-500">
                  {u.name || "(no name)"} · joined {new Date(u.createdAt).toLocaleDateString()}
                </div>
              </div>
              {actions && (
                <div className="flex gap-2">
                  <form action={approveUser}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded">
                      Approve
                    </button>
                  </form>
                  <form action={banUser}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="text-xs border border-slate-300 hover:border-slate-400 px-3 py-1.5 rounded">
                      Ban
                    </button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }
}
