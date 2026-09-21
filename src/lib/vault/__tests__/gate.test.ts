import { describe, expect, it } from "vitest";
import { createGate } from "../gate";

/** Work that finishes when the test says so. */
function pending<T>() {
  let finish: (value: T) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  return { promise, finish, fail };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("how many slow things run at once", () => {
  it("runs the work and gives back its answer", async () => {
    const gate = createGate({ running: 1, waiting: 0 });
    await expect(gate.run(async () => 7)).resolves.toEqual({ ok: true, value: 7 });
  });

  it("holds the ones past the limit until a slot frees", async () => {
    const gate = createGate({ running: 1, waiting: 4 });
    const first = pending<string>();
    const running = gate.run(() => first.promise);
    let secondStarted = false;
    const waiting = gate.run(async () => {
      secondStarted = true;
      return "second";
    });

    await settled();
    expect(secondStarted).toBe(false);

    first.finish("first");
    await expect(running).resolves.toEqual({ ok: true, value: "first" });
    await expect(waiting).resolves.toEqual({ ok: true, value: "second" });
  });

  /**
   * The point of the whole module: past the queue the answer is immediate and
   * cheap, so a flood costs refusals rather than the machine.
   */
  it("refuses once the queue behind it is full", async () => {
    const gate = createGate({ running: 1, waiting: 1 });
    const held = pending<string>();
    const running = gate.run(() => held.promise);
    const queued = gate.run(async () => "queued");

    await expect(gate.run(async () => "turned away")).resolves.toEqual({ ok: false });

    held.finish("held");
    await expect(running).resolves.toEqual({ ok: true, value: "held" });
    await expect(queued).resolves.toEqual({ ok: true, value: "queued" });
  });

  it("frees the slot when the work throws, rather than losing it", async () => {
    const gate = createGate({ running: 1, waiting: 0 });
    await expect(
      gate.run(async () => {
        throw new Error("scrypt fell over");
      })
    ).rejects.toThrow("scrypt fell over");
    // A lost slot would make this refusal instead.
    await expect(gate.run(async () => "after")).resolves.toEqual({ ok: true, value: "after" });
  });

  it("serves those waiting in the order they arrived", async () => {
    const gate = createGate({ running: 1, waiting: 4 });
    const held = pending<string>();
    const order: string[] = [];
    const running = gate.run(() => held.promise);
    const one = gate.run(async () => {
      order.push("one");
      return 1;
    });
    const two = gate.run(async () => {
      order.push("two");
      return 2;
    });

    held.finish("held");
    await Promise.all([running, one, two]);
    expect(order).toEqual(["one", "two"]);
  });

  it("refuses to be built as a closed door", () => {
    expect(() => createGate({ running: 0, waiting: 10 })).toThrow();
  });
});
