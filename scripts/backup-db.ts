import "dotenv/config";
import { createDatabaseBackup } from "../src/lib/backup-runtime";

const automatic = process.argv.includes("--automatic");

createDatabaseBackup({
  kind: automatic ? "AUTOMATIC" : "MANUAL",
  triggeredBy: automatic ? "SYSTEM_SCHEDULE" : "CLI",
})
  .then((backup) => {
    console.log(`Database backup completed: ${backup.filePath}`);
    console.log(`SHA-256: ${backup.sha256}`);
  })
  .catch((error) => {
    console.error("Database backup failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
