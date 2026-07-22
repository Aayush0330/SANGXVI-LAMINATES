import "dotenv/config";
import {
  generateDailyBusinessArchive,
  getDefaultArchiveDate,
} from "../src/lib/daily-business-archive";

const dateArg = process.argv.find((value) => value.startsWith("--date="));
const businessDate = dateArg?.slice("--date=".length) || getDefaultArchiveDate();

generateDailyBusinessArchive(businessDate)
  .then((result) => {
    console.log(`Daily business archive created: ${result.filePath}`);
    console.log(`SHA-256: ${result.sha256}`);
  })
  .catch((error) => {
    console.error("Daily business archive failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
