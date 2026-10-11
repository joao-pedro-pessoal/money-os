"use server";

import { createHash, randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { qrSignIns, users } from "@/db/schema";
import { endedBy, newSessionValue, readSession, SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth";

const COOKIE = "moneyos_qr_request";
const TTL = 300;
const tokenPattern = /^[a-f0-9]{64}$/;
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("hex");

/** No session capability is ever put in the QR image or its URL. */
export async function createQrSignIn() {
  const jar = await cookies();
  const previous = jar.get(COOKIE)?.value;
  const requester = random(), approval = random(), id = random();
  const code = randomInt(100000, 1000000).toString();
  const now = new Date(), expiresAt = new Date(now.getTime() + TTL * 1000);
  const made = await db.transaction(async (tx) => {
    // Cross-process bound on anonymous storage, including requests from new cookies.
    await tx.execute(sql`select pg_advisory_xact_lock(1297040207, 2)`);
    await tx.delete(qrSignIns).where(lte(qrSignIns.expiresAt, now));
    if (previous && tokenPattern.test(previous)) await tx.delete(qrSignIns).where(eq(qrSignIns.requesterHash, digest(previous)));
    const [count] = await tx.select({ n: sql<number>`count(*)::int` }).from(qrSignIns);
    if (count.n >= 500) return false;
    await tx.insert(qrSignIns).values({ id, requesterHash: digest(requester), approvalHash: digest(approval), codeHash: digest(code), expiresAt });
    return true;
  });
  if (!made) return { kind: "busy" as const };
  jar.set(COOKIE, requester, { ...sessionCookieOptions(), maxAge: TTL });
  return { kind: "created" as const, id, approval, code, expiresAt: expiresAt.toISOString() };
}

export async function cancelQrSignIn() {
  const jar = await cookies();
  const requester = jar.get(COOKIE)?.value;
  if (requester && tokenPattern.test(requester)) await db.delete(qrSignIns).where(eq(qrSignIns.requesterHash, digest(requester)));
  jar.delete(COOKIE);
}

/** Fresh DB check: never approve through the proxy's 30-second revocation cache. */
export async function qrApprover() {
  const session = await readSession((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!session.valid) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId));
  if (!user || !user.email || endedBy(user.sessionsNotBefore, session.issuedAt)) return null;
  return { email: user.email };
}

export async function approveQrSignIn(id: string, approval: string, code: string) {
  if (!tokenPattern.test(id) || !tokenPattern.test(approval) || !/^\d{6}$/.test(code)) return "invalid" as const;
  const session = await readSession((await cookies()).get(SESSION_COOKIE_NAME)?.value);
  if (!session.valid) return "sign-in" as const;
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, session.userId)).for("update");
    if (!user || endedBy(user.sessionsNotBefore, session.issuedAt)) return "sign-in" as const;
    const now = new Date();
    // Each attempt claims a row lock and increments in SQL; five guesses total.
    const [request] = await tx.update(qrSignIns).set({ attempts: sql`${qrSignIns.attempts} + 1` })
      .where(and(eq(qrSignIns.id, id), eq(qrSignIns.approvalHash, digest(approval)),
        gt(qrSignIns.expiresAt, now), isNull(qrSignIns.approvedAt), lt(qrSignIns.attempts, 5))).returning();
    if (!request || request.codeHash !== digest(code)) return "invalid" as const;
    await tx.update(qrSignIns).set({ approvedUserId: user.id, approvedAt: now, approverIssuedAt: session.issuedAt })
      .where(eq(qrSignIns.id, id));
    return "approved" as const;
  });
}

/** Only the browser holding the independent HttpOnly cookie can consume. */
export async function consumeQrSignIn(id: string) {
  const jar = await cookies();
  const requester = jar.get(COOKIE)?.value;
  if (!tokenPattern.test(id) || !requester || !tokenPattern.test(requester)) return "expired" as const;
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [request] = await tx.select().from(qrSignIns)
      .where(and(eq(qrSignIns.id, id), eq(qrSignIns.requesterHash, digest(requester)))).for("update");
    if (!request || request.expiresAt <= now || request.attempts >= 5 && !request.approvedAt) return { kind: "expired" as const };
    if (!request.approvedUserId || !request.approvedAt || !request.approverIssuedAt) return { kind: "pending" as const };
    const [user] = await tx.select().from(users).where(eq(users.id, request.approvedUserId));
    await tx.delete(qrSignIns).where(eq(qrSignIns.id, id));
    if (!user || endedBy(user.sessionsNotBefore, request.approverIssuedAt)) return { kind: "expired" as const };
    // Keep the original approver's issue time: a recovery racing this response
    // must invalidate the new device too, not mint a post-recovery credential.
    return { kind: "ok" as const, value: await newSessionValue(user.id, request.approverIssuedAt) };
  });
  if (result.kind === "ok") {
    jar.set(SESSION_COOKIE_NAME, result.value, sessionCookieOptions());
    jar.delete(COOKIE);
  }
  return result.kind;
}
