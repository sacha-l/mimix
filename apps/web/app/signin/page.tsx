import { signIn, auth } from "../../auth";
import { redirect } from "next/navigation";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  const session = await auth();
  if (session) redirect(searchParams.callbackUrl || "/dashboard");
  const callback = searchParams.callbackUrl || "/dashboard";

  return (
    <div className="max-w-md mx-auto py-12">
      <h1 className="text-3xl font-bold mb-2">Sign in</h1>
      <p className="text-slate-600 mb-8">
        Mimix is in closed beta. Sign in to request access — we&apos;ll approve
        you by hand and email you when you&apos;re in.
      </p>

      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: callback });
        }}
      >
        <button
          type="submit"
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg font-semibold mb-3"
        >
          Continue with Google
        </button>
      </form>

      <div className="text-center text-xs text-slate-400 my-4">or</div>

      <form
        action={async (formData) => {
          "use server";
          await signIn("nodemailer", {
            email: formData.get("email") as string,
            redirectTo: callback,
          });
        }}
        className="space-y-3"
      >
        <input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        />
        <button
          type="submit"
          className="w-full border border-slate-300 hover:border-slate-400 py-3 rounded-lg font-semibold"
        >
          Email me a sign-in link
        </button>
      </form>
    </div>
  );
}
