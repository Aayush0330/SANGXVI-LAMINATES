import "dotenv/config";

const baseUrl = process.env.PHASE10_BASE_URL || "http://127.0.0.1:3000";
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET is missing.");

const paths = [
  "/api/cron/alert-escalation",
  "/api/cron/attendance-close",
  "/api/cron/backup",
  "/api/cron/daily-report",
  "/api/cron/reorder-alerts",
  "/api/cron/task-reminders",
];

async function main() {
  for (const path of paths) {
    const response = await fetch(`${baseUrl}${path}`);
    if (response.status !== 401) {
      throw new Error(`${path} did not fail closed without authorization (${response.status}).`);
    }
  }

  const authorized = await fetch(`${baseUrl}/api/cron/task-reminders`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (authorized.status === 401 || authorized.status === 403 || authorized.status >= 500) {
    throw new Error(`Authorized cron request failed (${authorized.status}).`);
  }

  console.log("Cron authorization fail-closed verification passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
