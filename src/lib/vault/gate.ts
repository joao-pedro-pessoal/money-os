/**
 * How many slow things may happen at once, and how many may wait.
 *
 * The sync server's password hash is deliberately expensive — scrypt at
 * N=2^15, about 32 MB of memory and half a second of CPU per call — because
 * that is what makes a stolen hash useless. Every sign-in runs one, *including*
 * a sign-in for an address that does not exist: it is run against a decoy hash
 * so that a wrong address and a wrong password take the same time, which is
 * the right thing to do and also means an attacker needs no account to make
 * the server spend that half-second.
 *
 * Nothing bounded it. A few hundred concurrent sign-ins with random addresses
 * allocate a few hundred times 32 MB at once and take every core, and the
 * account lockout cannot help: it counts wrong passwords per account, and an
 * address that does not exist has no account to count them against. The whole
 * app shares that process, so the rest of it — the dashboard, a sync, a price
 * refresh — stalls with it.
 *
 * So the expensive step passes through here. A fixed number run at a time, a
 * fixed number wait their turn, and past that the answer is "busy, try again"
 * — which costs a database lookup and nothing else. A flood gets refusals
 * instead of the machine.
 *
 * Pure: no I/O, no timers, nothing about passwords. It counts.
 */

export interface Gate {
  /**
   * Runs `work` once a slot is free, or refuses when the queue behind it is
   * already full. An exception from `work` travels to the caller and releases
   * the slot on its way out.
   */
  run<T>(work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }>;
}

export function createGate({ running, waiting }: { running: number; waiting: number }): Gate {
  if (running < 1) throw new Error("A gate that runs nothing is a closed door.");
  let active = 0;
  const queue: (() => void)[] = [];

  /**
   * The slot is handed to whoever is next rather than released and re-taken.
   *
   * Decrementing here and letting the waiter increment for itself would leave
   * the count free for an instant, and a request arriving in that instant
   * would take the slot ahead of someone who has been waiting — the queue
   * would stop being a queue under exactly the load it exists for.
   */
  const pass = () => {
    const next = queue.shift();
    if (next) next();
    else active--;
  };

  return {
    async run<T>(work: () => Promise<T>) {
      if (active >= running) {
        if (queue.length >= waiting) return { ok: false as const };
        await new Promise<void>((resolve) => queue.push(resolve));
      } else {
        active++;
      }
      try {
        return { ok: true as const, value: await work() };
      } finally {
        pass();
      }
    },
  };
}
