import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="min-h-screen flex items-center justify-center">
      <form action={login} className="card p-8 w-80 space-y-4">
        <div className="text-sm font-semibold">Money OS</div>
        <p className="text-xs text-[var(--muted)]">Private instance. Enter your password.</p>
        <input type="password" name="password" placeholder="Password" className="input" autoFocus />
        {error && <p className="text-xs text-[var(--red)]">Wrong password.</p>}
        <button type="submit" className="btn w-full">
          Enter
        </button>
      </form>
    </div>
  );
}
