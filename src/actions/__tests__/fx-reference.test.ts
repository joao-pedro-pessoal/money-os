import { beforeEach, describe, expect, it, vi } from "vitest";
import { toBase } from "@/lib/fx";

const fake = vi.hoisted(() => ({
  rows: [] as { quote: string; rate: string }[],
  write: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: {
  select: () => ({ from: () => Object.assign(Promise.resolve(fake.rows), {
    where: async () => fake.rows,
  }) }),
  update: () => ({ set: (value: unknown) => ({ where: async () => fake.write(value) }) }),
  insert: () => ({ values: async (value: unknown) => fake.write(value) }),
} }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { getRates, listRates, setManualRate } from "../fx";

beforeEach(() => { fake.rows = []; fake.write.mockClear(); });

describe("exchange rates keep their EUR reference", () => {
  it("refuses to pin the reference currency at another value", async () => {
    const form = new FormData();
    form.set("quote", " eur ");
    form.set("rate", "2");
    await expect(setManualRate(form)).rejects.toThrow(/EUR/);
    expect(fake.write).not.toHaveBeenCalled();
  });

  it("ignores a previously stored reference override when converting", async () => {
    fake.rows = [{ quote: "EUR", rate: "2" }, { quote: "USD", rate: "1.25" }];
    const rates = await getRates();
    expect(toBase(125, "USD", rates, "EUR")).toBe(100);
    expect(toBase(100, "EUR", rates, "USD")).toBe(125);
    expect(await listRates()).toContainEqual(expect.objectContaining({ quote: "EUR", rate: "1", manual: false }));
  });

  it("still allows a manual rate for another currency", async () => {
    const form = new FormData();
    form.set("quote", "usd");
    form.set("rate", "1.25");
    await setManualRate(form);
    expect(fake.write).toHaveBeenCalledWith(expect.objectContaining({ base: "EUR", quote: "USD", rate: "1.25" }));
  });
});
