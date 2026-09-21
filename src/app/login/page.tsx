import { login } from "./actions";
import { siteLoginLockedUntil } from "@/actions/siteLogin";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // Read from the server, not the address, so a refresh still says it.
  const lockedUntil = await siteLoginLockedUntil();
  const opensAt = lockedUntil?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="min-h-screen flex items-center justify-center">
      <form action={login} className="card p-8 w-80 space-y-4">
        <div className="text-sm font-semibold">Money OS</div>
        <p className="text-xs text-[var(--muted)]">Private instance. Enter your password.</p>
        <input type="password" name="password" placeholder="Password" className="input" autoFocus />
        {lockedUntil ? (
          <p className="text-xs text-[var(--red)]">
            Too many wrong passwords. The login opens again at {opensAt}.
          </p>
        ) : (
          error && <p className="text-xs text-[var(--red)]">Wrong password.</p>
        )}
        <button type="submit" className="btn w-full">
          Enter
        </button>
      </form>
    </div>
  );
}
