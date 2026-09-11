import * as SQLite from 'expo-sqlite';
import { File } from 'expo-file-system';
import { databaseKey } from './secrets';
import { LocalVault } from './repository';
import { migrations } from './migrations.generated';

export async function openVault(): Promise<LocalVault> {
  const filename = 'money-os-v1.db';
  // Android SQLite exposes an absolute filesystem path; File requires a URI.
  // Preserve iOS file:// URIs and check the same directory SQLite will open.
  const directory = SQLite.defaultDatabaseDirectory;
  const directoryUri = directory.startsWith('/')
    ? `file://${directory.split('/').map(encodeURIComponent).join('/')}`
    : directory;
  const exists = new File(directoryUri, filename).exists;
  const key = await databaseKey(exists);
  const db = await SQLite.openDatabaseAsync(filename);
  try {
    // Only fixed-format random hex is interpolated; never user-controlled SQL.
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    const cipher = await db.getFirstAsync<Record<string, unknown>>('PRAGMA cipher_version');
    if (!cipher || !Object.values(cipher).some(v => typeof v === 'string' && v.length > 0))
      throw new Error('Esta instalação não tem cifragem SQLCipher. Instala a build nativa; Expo Go não é compatível.');
    await db.execAsync('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA secure_delete = ON;');
    // The handle is not exposed yet, so nothing can interleave. Expo's exclusive
    // transaction opens another connection, which would not inherit PRAGMA key.
    await db.withTransactionAsync(async () => {
      const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
      const current = row?.user_version ?? 0;
      if (current > migrations.length) throw new Error('Atualiza a app antes de abrir este cofre.');
      for (let i = current; i < migrations.length; i++) {
        await db.execAsync(migrations[i]);
        await db.execAsync(`PRAGMA user_version = ${i + 1}`);
      }
    });
    return await LocalVault.open({
      async read() { return (await db.getFirstAsync<{ payload: string }>('SELECT payload FROM vault_state WHERE id = 1'))?.payload ?? null; },
      async write(json) {
        await db.runAsync('INSERT INTO vault_state (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload', json);
      },
      async readSyncBase() {
        const row = await db.getFirstAsync<{ version: number; payload: string }>('SELECT version, payload FROM sync_base WHERE id = 1');
        return row ? { version: row.version, json: row.payload } : null;
      },
      async writeWithSyncBase(json, base) {
        // The non-exclusive transaction stays on this connection, which holds the
        // key PRAGMA. LocalVault queues every write, so nothing interleaves with it.
        await db.withTransactionAsync(async () => {
          await db.runAsync('INSERT INTO vault_state (id, payload) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload', json);
          if (base === null) await db.runAsync('DELETE FROM sync_base WHERE id = 1');
          else await db.runAsync('INSERT INTO sync_base (id, version, payload) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET version = excluded.version, payload = excluded.payload', base.version, base.json);
        });
      },
      async close() { await db.closeAsync(); },
    });
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}
