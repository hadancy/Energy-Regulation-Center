import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const referencePath = "/Users/hadancy/Desktop/能耗占比_日期时间轴优化版.xlsx";
const targetPath = "/Users/hadancy/Desktop/发电量预测.xlsx";
const outputDir = "/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/format_match_20260710";

await fs.mkdir(outputDir, { recursive: true });

async function loadWorkbook(filePath) {
  const blob = await FileBlob.load(filePath);
  return SpreadsheetFile.importXlsx(blob);
}

function sheetNamesFromInspection(ndjson) {
  const names = [];
  for (const line of ndjson.split("\n")) {
    if (!line.trim()) continue;
    const record = JSON.parse(line);
    if (record.kind === "sheet" && record.name) names.push(record.name);
  }
  return names;
}

async function inspectAndRender(label, workbook) {
  const overview = await workbook.inspect({
    kind: "workbook,sheet,table",
    maxChars: 8000,
    tableMaxRows: 8,
    tableMaxCols: 12,
    tableMaxCellChars: 100,
  });
  console.log(`### ${label} overview`);
  console.log(overview.ndjson);

  const sheetInspect = await workbook.inspect({ kind: "sheet", include: "id,name" });
  const sheetNames = sheetNamesFromInspection(sheetInspect.ndjson);
  console.log(`### ${label} sheets`);
  console.log(sheetInspect.ndjson);

  for (const sheetName of sheetNames) {
    const table = await workbook.inspect({
      kind: "table",
      sheetId: sheetName,
      range: "A1:AZ100",
      include: "values,formulas",
      tableMaxRows: 15,
      tableMaxCols: 20,
      tableMaxCellChars: 120,
      maxChars: 8000,
    });
    console.log(`### ${label} table: ${sheetName}`);
    console.log(table.ndjson);

    const styles = await workbook.inspect({
      kind: "computedStyle",
      sheetId: sheetName,
      range: "A1:E6",
      maxChars: 5000,
    });
    console.log(`### ${label} styles: ${sheetName}`);
    console.log(styles.ndjson);

    const previewRange =
      label === "reference" && sheetName === "监控调用长表" ? "A1:E40" : "A1:Z40";
    const preview = await workbook.render({ sheetName, range: previewRange, scale: 1.5, format: "png" });
    const safeName = sheetName.replaceAll(/[^\p{L}\p{N}_-]+/gu, "_");
    await fs.writeFile(
      path.join(outputDir, `${label}_${safeName}.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }
}

const targetWorkbook = await loadWorkbook(targetPath);
const sheet = targetWorkbook.worksheets.getItem("Sheet1");
const usedRange = sheet.getRange("A1:Y33");
const valuesBefore = JSON.stringify(usedRange.values);

sheet.showGridLines = false;
sheet.freezePanes.unfreeze();
sheet.freezePanes.freezeRows(2);

sheet.unmergeCells("A1:Y1");
sheet.mergeCells("A1:Y1");

usedRange.format.font = { name: "Carlito", size: 11, color: "#1F2937" };

const titleRange = sheet.getRange("A1:Y1");
titleRange.format = {
  fill: "#17324D",
  font: { name: "Carlito", size: 14, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "left",
  verticalAlignment: "center",
  wrapText: false,
};
titleRange.format.rowHeight = 28;

const headerRange = sheet.getRange("A2:Y2");
headerRange.format = {
  fill: "#D9EAF7",
  font: { name: "Carlito", size: 11, bold: true, color: "#17324D" },
  borders: { preset: "all", style: "thin", color: "#B7CDE0" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: false,
};
headerRange.format.rowHeight = 22;

const dataRange = sheet.getRange("A3:X33");
dataRange.format = {
  font: { name: "Carlito", size: 11, color: "#1F2937" },
  borders: { preset: "all", style: "thin", color: "#E4ECF2" },
  numberFormat: "0.000",
  horizontalAlignment: "right",
  verticalAlignment: "center",
  wrapText: false,
};
dataRange.format.rowHeight = 20;
dataRange.conditionalFormats.deleteAll();
dataRange.conditionalFormats.add("colorScale", {
  criteria: [
    { type: "lowestValue", color: "#D9EAF7" },
    { type: "percentile", value: 50, color: "#FFF2CC" },
    { type: "highestValue", color: "#FB923C" },
  ],
});

const totalRange = sheet.getRange("Y3:Y33");
totalRange.format = {
  fill: "#F4F8FB",
  font: { name: "Carlito", size: 11, color: "#17324D" },
  borders: { preset: "all", style: "thin", color: "#D6E0EA" },
  numberFormat: "0.00",
  horizontalAlignment: "right",
  verticalAlignment: "center",
  wrapText: false,
};

sheet.getRange("A1:X33").format.columnWidth = 9;
sheet.getRange("Y1:Y33").format.columnWidth = 10.5;

const valuesAfter = JSON.stringify(usedRange.values);
if (valuesAfter !== valuesBefore) {
  throw new Error("Formatting changed worksheet values unexpectedly.");
}

const outputPath = path.join(outputDir, "发电量预测_能耗占比格式.xlsx");
const exported = await SpreadsheetFile.exportXlsx(targetWorkbook);
await exported.save(outputPath);

const finalWorkbook = await loadWorkbook(outputPath);
const finalSheet = finalWorkbook.worksheets.getItem("Sheet1");
if (JSON.stringify(finalSheet.getRange("A1:Y33").values) !== valuesBefore) {
  throw new Error("Round-trip export changed worksheet values unexpectedly.");
}

const tableCheck = await finalWorkbook.inspect({
  kind: "table",
  sheetId: "Sheet1",
  range: "A1:Y10",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 25,
  maxChars: 10000,
});
console.log("### final table check");
console.log(tableCheck.ndjson);

const styleCheck = await finalWorkbook.inspect({
  kind: "computedStyle",
  sheetId: "Sheet1",
  range: "A1:Y4",
  maxChars: 7000,
});
console.log("### final style check");
console.log(styleCheck.ndjson);

const errorCheck = await finalWorkbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log("### final error check");
console.log(errorCheck.ndjson);

const preview = await finalWorkbook.render({
  sheetName: "Sheet1",
  range: "A1:Y33",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(
  path.join(outputDir, "final_发电量预测_能耗占比格式.png"),
  new Uint8Array(await preview.arrayBuffer()),
);

console.log(`OUTPUT=${outputPath}`);
