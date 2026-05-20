import Link from "next/link";
import { requireApproved } from "../../lib/session";
import { prisma } from "../../lib/prisma";

export default async function DashboardPage() {
  const { user } = await requireApproved();
  const runs = await prisma.run.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="max-w-3xl">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">Your runs</h1>
          <p className="text-sm text-slate-600">{user.email}</p>
        </div>
        <Link
          href="/register"
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-semibold"
        >
          Start a new run
        </Link>
      </div>

      {runs.length === 0 ? (
        <div className="border border-slate-200 rounded-lg p-8 text-center text-slate-500">
          No runs yet.{" "}
          <Link href="/register" className="underline">
            Start one
          </Link>
          .
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
          {runs.map((r) => (
            <li key={r.id} className="px-4 py-3 flex justify-between items-center">
              <div>
                <div className="font-medium">{r.targetName}</div>
                <div className="text-xs text-slate-500">
                  {r.personas.length} persona{r.personas.length === 1 ? "" : "s"} ·{" "}
                  {new Date(r.createdAt).toLocaleString()} · {r.status}
                </div>
              </div>
              <Link
                href={r.status === "complete" ? `/report/${r.id}` : `/run/${r.id}`}
                className="text-sm underline text-slate-700"
              >
                {r.status === "complete" ? "Report →" : "Watch →"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
