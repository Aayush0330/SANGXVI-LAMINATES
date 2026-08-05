import ExcelJS from "exceljs";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export type ReportCell = string | number | boolean | Date | null | undefined;

export type ReportExportOptions = {
  title: string;
  subtitle?: string;
  fileName: string;
  columns: string[];
  rows: ReportCell[][];
};

export type ReportFormat = "pdf" | "xlsx";

export function getReportFormat(value: string | null): ReportFormat {
  return value === "pdf" ? "pdf" : "xlsx";
}

function safeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/\.(csv|pdf|xlsx)$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "sanghvi-report";
}

function displayValue(value: ReportCell) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function excelValue(value: ReportCell): ExcelJS.CellValue {
  if (value === null || value === undefined) return "";
  if (value instanceof Date || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  return String(value);
}

function cleanPdfText(value: ReportCell) {
  return displayValue(value)
    .replaceAll("₹", "Rs. ")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrapPdfText(text: string, maxCharacters: number, maxLines = 2) {
  if (!text) return [""];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= maxCharacters) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = word.length > maxCharacters ? `${word.slice(0, maxCharacters - 1)}...` : word;
    if (lines.length === maxLines - 1) break;
  }

  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    const last = lines[maxLines - 1] ?? "";
    lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxCharacters - 3)).trimEnd()}...`;
  }
  return lines;
}

async function buildExcelReport(options: ReportExportOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sanghvi ERP";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Report", {
    views: [{ state: "frozen", ySplit: 5 }],
    properties: { defaultRowHeight: 19 },
    pageSetup: {
      orientation: options.columns.length > 7 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  worksheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];

  const lastColumn = Math.max(1, options.columns.length);
  worksheet.mergeCells(1, 1, 1, lastColumn);
  worksheet.getCell(1, 1).value = options.title;
  worksheet.getCell(1, 1).font = { name: "Aptos Display", size: 20, bold: true, color: { argb: "FF0F172A" } };
  worksheet.getCell(1, 1).alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(1).height = 30;

  worksheet.mergeCells(2, 1, 2, lastColumn);
  worksheet.getCell(2, 1).value = options.subtitle || "Generated from live Sanghvi ERP records";
  worksheet.getCell(2, 1).font = { name: "Aptos", size: 10, color: { argb: "FF64748B" } };
  worksheet.getRow(2).height = 20;

  worksheet.mergeCells(3, 1, 3, lastColumn);
  worksheet.getCell(3, 1).value = `Generated: ${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date())} IST  |  ${options.rows.length.toLocaleString("en-IN")} records`;
  worksheet.getCell(3, 1).font = { name: "Aptos", size: 9, italic: true, color: { argb: "FF94A3B8" } };
  worksheet.getRow(3).height = 18;

  const headerRow = worksheet.getRow(5);
  headerRow.values = options.columns;
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1D4ED8" } };
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = { bottom: { style: "medium", color: { argb: "FF1E40AF" } } };
  });

  for (const [rowIndex, rowValues] of options.rows.entries()) {
    const row = worksheet.addRow(rowValues.map(excelValue));
    row.height = 24;
    row.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 10, color: { argb: "FF334155" } };
      cell.alignment = { vertical: "middle", horizontal: typeof cell.value === "number" ? "right" : "left", wrapText: true };
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
      if (rowIndex % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
    });
  }

  options.columns.forEach((columnName, columnIndex) => {
    const sampleLengths = options.rows
      .slice(0, 150)
      .map((row) => displayValue(row[columnIndex]).length);
    const longest = Math.max(columnName.length + 2, ...sampleLengths, 10);
    worksheet.getColumn(columnIndex + 1).width = Math.min(Math.max(longest + 2, 12), 34);
  });

  worksheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5, column: lastColumn },
  };
  worksheet.headerFooter.oddFooter = "Sanghvi ERP | &P of &N";

  return workbook.xlsx.writeBuffer();
}

function drawPdfHeader({
  page,
  boldFont,
  regularFont,
  title,
  subtitle,
  partLabel,
}: {
  page: PDFPage;
  boldFont: PDFFont;
  regularFont: PDFFont;
  title: string;
  subtitle: string;
  partLabel?: string;
}) {
  const { width, height } = page.getSize();
  page.drawRectangle({ x: 0, y: height - 72, width, height: 72, color: rgb(0.055, 0.09, 0.16) });
  page.drawText(cleanPdfText(title), { x: 28, y: height - 34, size: 17, font: boldFont, color: rgb(1, 1, 1) });
  page.drawText(cleanPdfText(subtitle), { x: 28, y: height - 53, size: 8.5, font: regularFont, color: rgb(0.75, 0.82, 0.93) });
  if (partLabel) {
    const labelWidth = boldFont.widthOfTextAtSize(partLabel, 8);
    page.drawText(partLabel, { x: width - labelWidth - 28, y: height - 34, size: 8, font: boldFont, color: rgb(0.58, 0.76, 1) });
  }
}

async function buildPdfReport(options: ReportExportOptions) {
  const document = await PDFDocument.create();
  document.setTitle(options.title);
  document.setAuthor("Sanghvi ERP");
  document.setCreator("Sanghvi ERP");
  document.setCreationDate(new Date());
  const regularFont = await document.embedFont(StandardFonts.Helvetica);
  const boldFont = await document.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [841.89, 595.28];
  const margin = 28;
  const columnsPerPart = 7;
  const columnIndexes = options.columns.map((_, index) => index);
  const columnParts: number[][] = [];

  if (columnIndexes.length <= columnsPerPart) {
    columnParts.push(columnIndexes);
  } else {
    const remaining = columnIndexes.slice(1);
    for (let index = 0; index < remaining.length; index += columnsPerPart - 1) {
      columnParts.push([0, ...remaining.slice(index, index + columnsPerPart - 1)]);
    }
  }

  const generatedLabel = `${new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date())} IST | ${options.rows.length.toLocaleString("en-IN")} records`;

  columnParts.forEach((part, partIndex) => {
    let page: PDFPage;
    let y: number;
    let pageNumberInPart = 0;
    const usableWidth = pageSize[0] - margin * 2;
    const rawWeights = part.map((columnIndex) => {
      const longest = Math.max(
        options.columns[columnIndex]?.length ?? 8,
        ...options.rows.slice(0, 80).map((row) => Math.min(cleanPdfText(row[columnIndex]).length, 30)),
      );
      return Math.max(8, Math.min(longest, 24));
    });
    const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
    const widths = rawWeights.map((weight) => (weight / totalWeight) * usableWidth);

    const startPage = () => {
      page = document.addPage(pageSize);
      pageNumberInPart += 1;
      drawPdfHeader({
        page,
        boldFont,
        regularFont,
        title: options.title,
        subtitle: options.subtitle || "Generated from live Sanghvi ERP records",
        partLabel: columnParts.length > 1 ? `Columns ${partIndex + 1}/${columnParts.length}` : undefined,
      });
      y = pageSize[1] - 92;
      let x = margin;
      part.forEach((columnIndex, index) => {
        page.drawRectangle({ x, y: y - 23, width: widths[index], height: 24, color: rgb(0.114, 0.306, 0.847) });
        const headerLines = wrapPdfText(cleanPdfText(options.columns[columnIndex]), Math.max(7, Math.floor(widths[index] / 5.2)), 2);
        headerLines.forEach((line, lineIndex) => {
          page.drawText(line, { x: x + 5, y: y - 10 - lineIndex * 8, size: 7, font: boldFont, color: rgb(1, 1, 1) });
        });
        x += widths[index];
      });
      y -= 24;
    };

    startPage();
    options.rows.forEach((row, rowIndex) => {
      const rowHeight = 27;
      if (y - rowHeight < 34) startPage();
      const fill = rowIndex % 2 === 0 ? rgb(1, 1, 1) : rgb(0.972, 0.98, 0.99);
      let x = margin;
      part.forEach((columnIndex, index) => {
        page.drawRectangle({ x, y: y - rowHeight, width: widths[index], height: rowHeight, color: fill });
        page.drawLine({ start: { x, y: y - rowHeight }, end: { x: x + widths[index], y: y - rowHeight }, thickness: 0.35, color: rgb(0.86, 0.89, 0.93) });
        const maxCharacters = Math.max(6, Math.floor(widths[index] / 4.5));
        const lines = wrapPdfText(cleanPdfText(row[columnIndex]), maxCharacters, 2);
        lines.forEach((line, lineIndex) => {
          page.drawText(line, { x: x + 5, y: y - 10 - lineIndex * 9, size: 7.2, font: regularFont, color: rgb(0.18, 0.25, 0.36) });
        });
        x += widths[index];
      });
      y -= rowHeight;
    });

    const pagesForPart = document.getPages().slice(-pageNumberInPart);
    pagesForPart.forEach((partPage, pageIndex) => {
      const footer = `${generatedLabel} | Page ${pageIndex + 1}/${pageNumberInPart}`;
      partPage.drawText(cleanPdfText(footer), { x: margin, y: 17, size: 7, font: regularFont, color: rgb(0.45, 0.52, 0.62) });
    });
  });

  if (options.rows.length === 0 && document.getPageCount() === 0) {
    const page = document.addPage(pageSize);
    drawPdfHeader({ page, boldFont, regularFont, title: options.title, subtitle: options.subtitle || "No records found" });
    page.drawText("No records matched the selected filters.", { x: margin, y: pageSize[1] - 120, size: 12, font: regularFont, color: rgb(0.39, 0.45, 0.55) });
  }

  return document.save();
}

export async function createReportDownloadResponse(
  format: ReportFormat,
  options: ReportExportOptions,
) {
  const baseName = safeFileName(options.fileName);
  const isPdf = format === "pdf";
  const bytes = isPdf ? await buildPdfReport(options) : await buildExcelReport(options);
  const extension = isPdf ? "pdf" : "xlsx";

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": isPdf
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${baseName}.${extension}"`,
      "Cache-Control": "no-store",
    },
  });
}
