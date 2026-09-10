import fs from 'node:fs';
const journal = JSON.parse(fs.readFileSync('drizzle/meta/_journal.json', 'utf8'));
const sql = journal.entries.map(e => fs.readFileSync(`drizzle/${e.tag}.sql`, 'utf8'));
fs.writeFileSync('src/storage/migrations.generated.ts', '// Generated from Drizzle SQL. Run npm run db:generate; never edit by hand.\nexport const migrations: readonly string[] = ' + JSON.stringify(sql, null, 2) + ';\n');
