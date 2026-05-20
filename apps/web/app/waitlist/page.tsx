import { auth, signOut } from "../../auth";
import { prisma } from "../../lib/prisma";
import { redirect } from "next/navigation";

export default async function WaitlistPage() {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin");
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });
  if (user?.status === "APPROVED") redirect("/dashboard");

  return (
    <div className="max-w-md mx-auto py-12">
      <h1 className="text-3xl font-bold mb-3">You&apos;re on the waitlist</h1>
      <p className="text-slate-600 mb-6">
        Mimix is in closed beta. We&apos;ve received your request as{" "}
        <span className="font-mono">{session.user.email}</span> and you&apos;ll get an
        email the moment your account is approved.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      >
        <button className="text-sm underline text-slate-500">Sign out</button>
      </form>
    </div>
  );
}
