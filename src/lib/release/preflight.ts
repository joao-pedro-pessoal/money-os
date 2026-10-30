import { maxAccounts } from "../accounts/limits";
import { hasInviteSecret, registrationMode } from "../accounts/registration";
import { operatorFrom } from "../legal/documents";

/** Hosted closed-test configuration only; never returns environment values. */
export function closedTestPreflight(env: { [key: string]: string | undefined }): string[] {
  const problems: string[] = [];
  const operator = operatorFrom(env);
  if (!operator.name) problems.push("Definir OPERATOR_NAME.");
  if (!operator.email) problems.push("Definir CONTACT_EMAIL com um email válido.");
  if (env.COOKIE_SECURE !== "true") problems.push("Definir COOKIE_SECURE=true no site HTTPS publicado.");
  if (!env.APP_SECRET || env.APP_SECRET.length < 32 || /change|example|a-long-random/i.test(env.APP_SECRET)) {
    problems.push("Configurar APP_SECRET aleatório com pelo menos 32 caracteres.");
  }
  if (env.ENCRYPTION_KEY?.trim()) problems.push("Retirar ENCRYPTION_KEY do site público; as chaves das corretoras ficam no PC.");
  const cap = maxAccounts(env);
  if (cap === null || cap < 15) problems.push("Configurar MAX_ACCOUNTS com vagas para testadores, dono e revisão (mínimo 15; proposta 40).");
  if (registrationMode(env) !== "invite" || !hasInviteSecret(env)) {
    problems.push("Para este teste por convites, configurar REGISTRATION_MODE=invite e REGISTRATION_INVITE_CODE aleatório (32–256 caracteres).");
  }
  try {
    const address = new URL(env.DATABASE_URL ?? "");
    if (!["postgres:", "postgresql:"].includes(address.protocol)
      || !address.hostname || address.hostname.includes("-pooler")
      || ["localhost", "127.0.0.1", "[::1]"].includes(address.hostname)
      || ["postgres", "neondb_owner"].includes(decodeURIComponent(address.username))) throw new Error();
  } catch {
    problems.push("Configurar DATABASE_URL direto de produção com o utilizador limitado da app; confirmar RLS na base.");
  }
  return problems;
}

/** The first money-only release uses the existing controlled invitation launch. */
export function moneyReleasePreflight(env: { [key: string]: string | undefined }): string[] {
  const problems = closedTestPreflight(env);
  if (env.APP_EDITION !== "money") problems.push("Definir APP_EDITION=money antes de compilar a primeira versão publicada.");
  return problems;
}
