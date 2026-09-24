import fs from "node:fs";
import path from "node:path";

import Database from "better-sqlite3";

const databaseDir = path.resolve(
  process.cwd(),
  "data",
  "database"
);

fs.mkdirSync(
  databaseDir,
  {
    recursive: true,
  }
);

const databasePath = path.join(
  databaseDir,
  "cumplimiento-produccion.db"
);

export const db =
  new Database(databasePath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");