import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function openDatabase(path, migrations) {
  const sqlite = new DatabaseSync(path);
  sqlite.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)");
  for (const name of readdirSync(migrations).filter(name => name.endsWith(".sql")).sort()) {
    if (sqlite.prepare("SELECT name FROM _local_migrations WHERE name = ?").get(name)) continue;
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(readFileSync(join(migrations, name), "utf8"));
      sqlite.prepare("INSERT INTO _local_migrations VALUES (?)").run(name);
      sqlite.exec("COMMIT");
    } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  }
  return {
    close: () => sqlite.close(),
    prepare(sql) {
      const query = sqlite.prepare(sql);
      const bind = (...args) => ({
        first: async () => query.get(...args) || null,
        all: async () => ({ results: query.all(...args) }),
        run: async () => ({ meta: { changes: Number(query.run(...args).changes) } }),
      });
      return { ...bind(), bind };
    },
  };
}
