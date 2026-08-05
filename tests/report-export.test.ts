import assert from "node:assert/strict";
import test from "node:test";
import {
  createReportDownloadResponse,
  getReportFormat,
} from "../src/lib/report-export";

const sampleReport = {
  title: "Daily Employee Activity",
  subtitle: "Date: 2026-08-05",
  fileName: "daily-activity.csv",
  columns: ["Employee", "Login", "Punch Out", "Status"],
  rows: [["Sumit", "09:02 am", "06:14 pm", "Completed"]],
};

test("report format accepts PDF and defaults every other value to Excel", () => {
  assert.equal(getReportFormat("pdf"), "pdf");
  assert.equal(getReportFormat("xlsx"), "xlsx");
  assert.equal(getReportFormat("csv"), "xlsx");
  assert.equal(getReportFormat(null), "xlsx");
});

test("Excel report response contains a valid XLSX zip signature", async () => {
  const response = await createReportDownloadResponse("xlsx", sampleReport);
  const bytes = new Uint8Array(await response.arrayBuffer());

  assert.equal(
    response.headers.get("content-type"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  assert.match(response.headers.get("content-disposition") || "", /daily-activity\.xlsx/);
  assert.deepEqual(Array.from(bytes.slice(0, 2)), [0x50, 0x4b]);
});

test("PDF report response contains a valid PDF signature", async () => {
  const response = await createReportDownloadResponse("pdf", sampleReport);
  const bytes = new Uint8Array(await response.arrayBuffer());

  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition") || "", /daily-activity\.pdf/);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), "%PDF-");
});
