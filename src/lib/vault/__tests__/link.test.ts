import { describe, expect, it } from "vitest";
import { createVaultClient, type VaultTransport } from "../client";
import {
  approveAddress,
  AskLinkRequest,
  CreateSignInRequest,
  GrantSignInRequest,
  signInRequestState,
  claimHashOf,
  CollectLinkRequest,
  CreateLinkRequest,
  describeDevice,
  isLinkId,
  linkAddress,
  linkState,
  newLinkKey,
  openSeed,
  readLinkFragment,
  sealSeed,
  unreachableFromPhone,
} from "../link";
import { generateSeed } from "../seed";

const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));
const ID = "AbCdEfGhIjKlMnOpQrStUv";

describe("the words in a code", () => {
  it("come back whole with the code's key, and the sealed text does not contain them", async () => {
    const seed = await generateSeed(random);
    const key = newLinkKey(random);
    const sealed = sealSeed(seed, key, random);
    expect(openSeed(sealed, key)).toBe(seed);
    for (const word of seed.split(" ")) expect(sealed).not.toContain(word);
  });

  it("open with no other key, and say the code is wrong rather than returning other words", async () => {
    const sealed = sealSeed(await generateSeed(random), newLinkKey(random), random);
    expect(() => openSeed(sealed, newLinkKey(random))).toThrow(/does not match/);
  });

  it("refuse a sealed text altered on the way", async () => {
    const key = newLinkKey(random);
    const sealed = sealSeed(await generateSeed(random), key, random);
    const flipped = sealed.slice(0, -1) + (sealed.endsWith("0") ? "1" : "0");
    expect(() => openSeed(flipped, key)).toThrow(/does not match/);
  });

  it("are refused before sealing when they are not a seed at all", () => {
    expect(() => sealSeed("twelve random words that are not a seed", newLinkKey(random), random)).toThrow();
  });

  it("travel in a shape the server accepts, and nothing longer", async () => {
    const sealed = sealSeed(await generateSeed(random), newLinkKey(random), random);
    expect(CreateLinkRequest.safeParse({ sealed }).success).toBe(true);
    expect(CreateLinkRequest.safeParse({ sealed: sealed + "00".repeat(200) }).success).toBe(false);
    expect(CreateLinkRequest.safeParse({ sealed, extra: 1 }).success).toBe(false);
  });
});

describe("the code's address", () => {
  it("keeps the key after #, where a browser never sends it", () => {
    const key = newLinkKey(random);
    const address = linkAddress("https://money.example/", ID, key);
    expect(address).toBe(`https://money.example/vault/link#${ID}.${key}`);
    const url = new URL(address);
    expect(url.pathname + url.search).not.toContain(key);
    expect(readLinkFragment(url.hash)).toEqual({ id: ID, key });
  });

  it("reads nothing from a fragment that is not a code", () => {
    expect(readLinkFragment("")).toBeNull();
    expect(readLinkFragment("#")).toBeNull();
    expect(readLinkFragment(`#${ID}`)).toBeNull();
    expect(readLinkFragment(`#${ID}.short`)).toBeNull();
    expect(readLinkFragment(`#${ID}.${newLinkKey(random)}.more`)).toBeNull();
    expect(readLinkFragment(`#../x.${newLinkKey(random)}`)).toBeNull();
  });

  it("is refused when a phone could not reach it", () => {
    expect(unreachableFromPhone("http://localhost:3000")).toBe(true);
    expect(unreachableFromPhone("http://127.0.0.1:3000")).toBe(true);
    expect(unreachableFromPhone("http://[::1]:3000")).toBe(true);
    expect(unreachableFromPhone("http://192.168.1.20:3000")).toBe(false);
    expect(unreachableFromPhone("https://money-os-abc.vercel.app")).toBe(false);
  });

  it("names ids the way the server makes them", () => {
    expect(isLinkId(ID)).toBe(true);
    expect(isLinkId(ID + "x")).toBe(false);
    expect(isLinkId("../../etc/passwd000000")).toBe(false);
  });
});

describe("the phone's claim", () => {
  it("is kept by the server only as a hash, which the collect request cannot be mistaken for", () => {
    const claimKey = newLinkKey(random);
    const hash = claimHashOf(claimKey);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(claimKey);
    expect(AskLinkRequest.safeParse({ deviceName: "Android phone · Chrome", claimHash: hash }).success).toBe(true);
    expect(CollectLinkRequest.safeParse({ claimKey }).success).toBe(true);
    expect(CollectLinkRequest.safeParse({ claimKey: hash }).success).toBe(false);
  });
});

describe("where a code stands", () => {
  const now = new Date("2026-09-28T12:00:00Z");
  const later = new Date("2026-09-28T12:03:00Z");
  const earlier = new Date("2026-09-28T11:59:00Z");

  it("moves through its states while its minutes last", () => {
    expect(linkState({ state: "waiting", expiresAt: later }, now)).toBe("waiting");
    expect(linkState({ state: "asked", expiresAt: later }, now)).toBe("asked");
    expect(linkState({ state: "approved", expiresAt: later }, now)).toBe("approved");
  });

  it("is over once they run out, even with the owner's yes", () => {
    expect(linkState({ state: "waiting", expiresAt: earlier }, now)).toBe("expired");
    expect(linkState({ state: "approved", expiresAt: earlier }, now)).toBe("expired");
    expect(linkState({ state: "approved", expiresAt: now }, now)).toBe("expired");
  });

  it("stays collected after its minutes, so the device that showed it can say the phone got in", () => {
    expect(linkState({ state: "collected", expiresAt: earlier }, now)).toBe("collected");
  });

  it("treats a state it does not know as nothing granted", () => {
    expect(linkState({ state: "something-else", expiresAt: later }, now)).toBe("waiting");
  });
});

describe("a device's name", () => {
  it("is something the owner recognises when deciding whether to let it in", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
      )
    ).toBe("Android phone · Chrome");
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
      )
    ).toBe("iPhone · Safari");
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0"
      )
    ).toBe("Windows computer · Edge");
    expect(
      describeDevice(
        "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36"
      )
    ).toBe("Android phone · Samsung Internet");
    expect(describeDevice("curl/8.0")).toBe("Device");
  });

  it("fits the server's limit on a device name", () => {
    expect(describeDevice("x".repeat(500)).length).toBeLessThanOrEqual(80);
  });
});

describe("a refusal's reason", () => {
  it("reaches the page in the server's own words, which it sends under `error`", async () => {
    const transport: VaultTransport = async () => ({
      status: 400,
      body: { error: "Use a password of at least 12 characters." },
    });
    await expect(createVaultClient(transport).register("a@b.pt", "short", "PC")).rejects.toThrow(
      "Use a password of at least 12 characters."
    );
  });
});

describe("the other direction: a device with no session asks a phone", () => {
  it("shows a code for the phone's approval page, the key again after #", () => {
    const key = newLinkKey(random);
    const address = approveAddress("https://money.example", ID, key);
    expect(address).toBe(`https://money.example/vault/approve#${ID}.${key}`);
    const url = new URL(address);
    expect(url.pathname + url.search).not.toContain(key);
    expect(readLinkFragment(url.hash)).toEqual({ id: ID, key });
  });

  it("asks under a name and a claim hash, and nothing else", () => {
    const hash = claimHashOf(newLinkKey(random));
    expect(CreateSignInRequest.safeParse({ deviceName: "Windows computer · Edge", claimHash: hash }).success).toBe(true);
    expect(CreateSignInRequest.safeParse({ deviceName: "PC", claimHash: hash, userId: "someone" }).success).toBe(false);
    expect(CreateSignInRequest.safeParse({ deviceName: "", claimHash: hash }).success).toBe(false);
  });

  it("is answered with the words sealed, which only the code's key opens", async () => {
    const seed = await generateSeed(random);
    const key = newLinkKey(random);
    const sealed = sealSeed(seed, key, random);
    expect(GrantSignInRequest.safeParse({ sealed }).success).toBe(true);
    expect(GrantSignInRequest.safeParse({ sealed: seed }).success).toBe(false);
    expect(openSeed(sealed, key)).toBe(seed);
  });

  it("waits, is granted, is collected once, and expires unless collected", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    const later = new Date("2026-09-29T12:04:00Z");
    const earlier = new Date("2026-09-29T11:59:00Z");
    expect(signInRequestState({ state: "waiting", expiresAt: later }, now)).toBe("waiting");
    expect(signInRequestState({ state: "granted", expiresAt: later }, now)).toBe("granted");
    expect(signInRequestState({ state: "granted", expiresAt: earlier }, now)).toBe("expired");
    expect(signInRequestState({ state: "collected", expiresAt: earlier }, now)).toBe("collected");
    expect(signInRequestState({ state: "anything", expiresAt: later }, now)).toBe("waiting");
  });
});
