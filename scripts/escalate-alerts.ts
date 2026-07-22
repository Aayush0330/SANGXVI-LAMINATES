import "dotenv/config";
import { runAlertEscalationSweep } from "../src/lib/alert-escalation";

runAlertEscalationSweep()
  .then((result) => {
    console.log(`Expired alerts: ${result.expired}`);
    console.log(`Escalated alerts: ${result.escalated}`);
  })
  .catch((error) => {
    console.error("Alert escalation failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
