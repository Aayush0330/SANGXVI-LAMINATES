import "dotenv/config";
import { verifyBackupFile } from "../src/lib/backup-runtime";

const file = process.argv.slice(2).find((value) => !value.startsWith("-"));
if (!file) throw new Error("Provide a backup path to verify.");

verifyBackupFile(file).then((result) => {
  if (!result.verified) {
    console.error(result.reason);
    process.exit(1);
  }
  console.log(`Backup verified. SHA-256: ${result.actualHash}`);
});
