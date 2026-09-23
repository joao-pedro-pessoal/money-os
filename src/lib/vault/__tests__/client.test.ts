import { describe, expect, it } from "vitest";
import { createVaultClient, openDocument, sealDocument, type VaultTransport } from "../client";
import { addAccount, emptyDocument } from "../document";
import { generateSeed } from "../seed";

const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));
const USER = "user-1";

/** A server that keeps versions in memory and refuses a stale write, as the real one does. */
function fakeServer() {
  const versions: { vaultVersion: number; text: string }[] = [];
  const transport: VaultTransport = async (method, path, init) => {
    if (path === "/api/vault/register" || path === "/api/vault/login") {
      const body = init.body as { password?: string };
      if (body?.password === "wrong") return { status: 401, body: { reason: "Wrong email or password." } };
      return { status: path.endsWith("register") ? 201 : 200, body: { token: "t", userId: USER, deviceId: "d" } };
    }
    if (method === "GET") {
      const last = versions.at(-1);
      return last ? { status: 200, body: last } : { status: 204, body: null };
    }
    const body = init.body as { vaultVersion: number; expectedVersion: number; text: string };
    if ((versions.at(-1)?.vaultVersion ?? 0) !== body.expectedVersion) {
      return { status: 409, body: { reason: "A newer version is stored." } };
    }
    versions.push({ vaultVersion: body.vaultVersion, text: body.text });
    return { status: 201, body: { vaultVersion: body.vaultVersion } };
  };
  return { transport, versions };
}

describe("signing in", () => {
  it("takes the session the server hands back, and says when it refuses", async () => {
    const client = createVaultClient(fakeServer().transport);
    await expect(client.register("a@b.pt", "a-long-password", "PC")).resolves.toEqual({
      token: "t",
      userId: USER,
      deviceId: "d",
    });
    await expect(client.login("a@b.pt", "wrong", "PC")).rejects.toThrow(/Wrong email or password/);
  });
});

describe("a vault across two devices", () => {
  it("reads on one device what the other wrote", async () => {
    const words = await generateSeed(random);
    const server = fakeServer();
    const client = createVaultClient(server.transport);

    // Device one: nothing stored yet, so it writes the first version.
    expect(await client.fetchVault("t")).toBeNull();
    const document = addAccount(emptyDocument("EUR"), {
      id: "a",
      name: "Conta à ordem",
      kind: "bank",
      currency: "EUR",
      balance: "250.00",
      createdAt: "2026-09-23",
    });
    const sealed = await sealDocument({ document, seed: words, userId: USER, version: 0, random });
    expect(await client.putVault("t", sealed)).toBe(1);

    // Device two: the same seed opens it, and reads the same money.
    const stored = await client.fetchVault("t");
    const opened = openDocument({ text: stored!.text, seed: words, userId: USER });
    expect(opened.version).toBe(1);
    expect(opened.document).toEqual(document);
    // What travelled is ciphertext: the account's name is not in it.
    expect(stored!.text).not.toContain("Conta");
  });

  it("refuses a stale save instead of overwriting the other device", async () => {
    const words = await generateSeed(random);
    const server = fakeServer();
    const client = createVaultClient(server.transport);
    const document = emptyDocument("EUR");

    await client.putVault("t", await sealDocument({ document, seed: words, userId: USER, version: 0, random }));
    await client.putVault("t", await sealDocument({ document, seed: words, userId: USER, version: 1, random }));

    // A device still holding version 1 tries to write version 2 again.
    const stale = await sealDocument({ document, seed: words, userId: USER, version: 1, random });
    await expect(client.putVault("t", stale)).rejects.toMatchObject({ kind: "conflict" });
    expect(server.versions).toHaveLength(2);
  });

  it("reads nothing with the wrong words, and says which problem it is", async () => {
    const words = await generateSeed(random);
    const other = await generateSeed(random);
    const sealed = await sealDocument({ document: emptyDocument("EUR"), seed: words, userId: USER, version: 0, random });

    expect(() => openDocument({ text: sealed.text, seed: other, userId: USER })).toThrow(/recovery seed/i);
    expect(() => openDocument({ text: sealed.text, seed: words, userId: "someone-else" })).toThrow(/different account/i);
    // A server answering with an older version than this device already has.
    expect(() => openDocument({ text: sealed.text, seed: words, userId: USER, minVersion: 5 })).toThrow(/older/i);
  });
});
