import "dotenv/config";
import { syncLowStockReorderAlerts } from "../src/lib/reorder-alerts";

syncLowStockReorderAlerts()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
