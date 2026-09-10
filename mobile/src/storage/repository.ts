import { emptyState, validateState, type LocalState } from '../domain/model';

export interface Persistence {
  read(): Promise<string | null>;
  // A single atomic write, including on failure or termination.
  write(json: string): Promise<void>;
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
  update(change: (draft: LocalState) => void): Promise<LocalState> {
    const task = this.tail.then(async () => {
      this.assertOpen();
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
    this.tail = task.catch(() => undefined);
    return task;
  }
  replace(next: LocalState): Promise<LocalState> {
    const validated = validateState(next);
    return this.update(draft => Object.assign(draft, validated));
  }
  async close(): Promise<void> {
    if (!this.active) return;
    this.active = false;
    await this.tail;
    this.current = emptyState();
    await this.persistence.close();
  }
}
