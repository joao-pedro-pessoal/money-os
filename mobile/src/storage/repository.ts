import { emptyState, validateState, type LocalState } from '../domain/model';
import { canonical } from '../domain/merge';

export interface SyncBaseRecord { version: number; json: string }

export interface Persistence {
  read(): Promise<string | null>;
  // A single atomic write, including on failure or termination.
  write(json: string): Promise<void>;
  /** The vault as last synced, and its version; null on a device that never synced. */
  readSyncBase(): Promise<SyncBaseRecord | null>;
  /**
   * The state and the sync base in one transaction, or neither. A null base forgets
   * it in that same transaction.
   */
  writeWithSyncBase(json: string, base: SyncBaseRecord | null): Promise<void>;
  close(): Promise<void>;
}
export class LocalVault {
  private tail: Promise<unknown> = Promise.resolve();
  private active = true;
  private constructor(private persistence: Persistence, private current: LocalState) {}
  static async open(persistence: Persistence): Promise<LocalVault> {
    const raw = await persistence.read();
    return new LocalVault(persistence, raw === null ? emptyState() : validateState(JSON.parse(raw)));
  }
  get isOpen(): boolean { return this.active; }
  snapshot(): LocalState {
    this.assertOpen();
    return JSON.parse(JSON.stringify(this.current));
  }
  private assertOpen(): void {
    if (!this.active) throw new Error('A app foi bloqueada. Desbloqueia para continuar.');
  }
  /** One writer at a time, for every operation that touches persistence. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const task = this.tail.then(async () => {
      this.assertOpen();
      return work();
    });
    this.tail = task.catch(() => undefined);
    return task;
  }
  update(change: (draft: LocalState) => void): Promise<LocalState> {
    return this.enqueue(async () => {
      const draft = this.snapshot();
      change(draft);
      const next = validateState(draft);
      await this.persistence.write(JSON.stringify(next));
      this.current = next;
      // A lock can arrive while SQLite is finishing an already-started write.
      // Report that committed write as successful so callers do not roll back
      // its SecureStore credentials after the database has accepted them.
      return JSON.parse(JSON.stringify(next)) as LocalState;
    });
  }
  replace(next: LocalState): Promise<LocalState> {
    const validated = validateState(next);
    return this.update(draft => Object.assign(draft, validated));
  }
  /**
   * Replaces everything and forgets the sync base, in one write: a restore or an erase.
   *
   * A restored backup is not an edit of the synced vault. Merged against the old
   * base, every record the backup lacks would read as a deletion and be removed
   * from every device on the account. Without a base the next sync is a first
   * sync — a union — and deletes nothing anywhere.
   */
  restore(next: LocalState): Promise<LocalState> {
    return this.enqueue(async () => {
      const validated = validateState(next);
      await this.persistence.writeWithSyncBase(JSON.stringify(validated), null);
      this.current = validated;
      return JSON.parse(JSON.stringify(validated)) as LocalState;
    });
  }
  /** The vault as last synced and its version, or null when this device never synced. */
  syncBase(): Promise<{ version: number; state: LocalState } | null> {
    return this.enqueue(async () => {
      const record = await this.persistence.readSyncBase();
      return record === null ? null : { version: record.version, state: validateState(JSON.parse(record.json)) };
    });
  }
  /**
   * Applies a sync round's result, only if nothing changed while it ran.
   *
   * The network can take seconds, and nobody's edits wait for it. When the state
   * is no longer the one the round started from, the result is set aside and
   * nothing is written: whatever was sent is already on the server, and the next
   * round merges it with the newer edits. Applying it anyway would overwrite them.
   *
   * State and base go down in one transaction, so a crash leaves both old or both new.
   */
  applySync(expected: LocalState, next: LocalState, base: LocalState, version: number): Promise<{ applied: boolean; state: LocalState }> {
    return this.enqueue(async () => {
      if (!Number.isSafeInteger(version) || version < 1) throw new Error('Versão de sincronização inválida.');
      const validNext = validateState(next);
      const validBase = validateState(base);
      if (canonical(this.current) !== canonical(expected)) return { applied: false, state: this.snapshot() };
      await this.persistence.writeWithSyncBase(JSON.stringify(validNext), { version, json: JSON.stringify(validBase) });
      this.current = validNext;
      return { applied: true, state: JSON.parse(JSON.stringify(validNext)) as LocalState };
    });
  }
  /** Forgets the sync base and keeps every local record, when this device stops syncing. */
  forgetSync(): Promise<void> {
    return this.enqueue(async () => {
      await this.persistence.writeWithSyncBase(JSON.stringify(this.current), null);
    });
  }
  async close(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    await this.tail;
    this.current = emptyState();
    await this.persistence.close();
  }
}
