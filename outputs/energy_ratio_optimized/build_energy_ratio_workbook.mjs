import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const inputPath = "/Users/hadancy/Desktop/能耗占比.xlsx";
const outputDir = "/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/energy_ratio_optimized";
const outputPath = `${outputDir}/能耗占比_日期时间轴优化版.xlsx`;

function columnLetter(index) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function hourLabel(hourIndex) {
  return `${String(hourIndex).padStart(2, "0")}:00`;
}

function normalizeNumber(value) {
  if (typeof value === "number") return value;
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace("%", "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

await fs.mkdir(outputDir, { recursive: true });

const input = await FileBlob.load(inputPath);
const sourceWorkbook = await SpreadsheetFile.importXlsx(input);
const sourceSheet = sourceWorkbook.worksheets.getItemAt(0);
const sourceValues = sourceSheet.getRange("A1:Y33").values;
const dataRows = sourceValues.slice(2).filter((row) => row.slice(0, 24).some((value) => value !== null && value !== ""));

if (dataRows.length === 0) {
  throw new Error("No data rows found in the source workbook.");
}

const workbook = Workbook.create();
const matrixSheet = workbook.worksheets.add("能耗占比矩阵");
const longSheet = workbook.worksheets.add("监控调用长表");

const hours = Array.from({ length: 24 }, (_, index) => hourLabel(index));
const providedDateLabels = [
  "4月1日",
  "4月2日",
  "4月3日",
  "4月4日",
  "4月5日",
  "4月6日",
  "4月7日",
  "4月8日",
  "4月9日",
  "4月10日",
  "8月1日",
  "8月2日",
  "8月3日",
  "8月4日",
  "8月5日",
  "8月6日",
  "8月7日",
  "8月8日",
  "8月9日",
  "8月10日",
  "1月1日",
  "1月2日",
  "1月3日",
  "1月4日",
  "1月5日",
  "1月6日",
  "1月7日",
  "1月8日",
  "1月9日",
  "1月10日",
  "1月11日",
];
const dateLabels = dataRows.map((_, index) => providedDateLabels[index] ?? `${index + 1}日`);

matrixSheet.showGridLines = false;
matrixSheet.getRange("A1:Z1").merge();
matrixSheet.getRange("A1").values = [["小时能耗占比（日期 × 时间轴）"]];
matrixSheet.getRange("A1:Z1").format = {
  fill: "#17324D",
  font: { bold: true, color: "#FFFFFF", size: 14 },
};

matrixSheet.getRange("A2:Z2").values = [["日期", ...hours, "总和"]];
matrixSheet.getRange("A2:Z2").format = {
  fill: "#D9EAF7",
  font: { bold: true, color: "#17324D" },
  borders: { preset: "all", style: "thin", color: "#B7CDE0" },
};

const matrixValues = dataRows.map((row, index) => [
  dateLabels[index],
  ...row.slice(0, 24).map(normalizeNumber),
]);
matrixSheet.getRangeByIndexes(2, 0, matrixValues.length, 25).values = matrixValues;
matrixSheet.getRange("Z3").formulas = [["=SUM(B3:Y3)"]];
matrixSheet.getRange(`Z3:Z${matrixValues.length + 2}`).fillDown();

matrixSheet.getRange(`A3:A${matrixValues.length + 2}`).format = {
  fill: "#F4F8FB",
  font: { bold: true, color: "#17324D" },
  borders: { preset: "all", style: "thin", color: "#D6E0EA" },
};
matrixSheet.getRange(`B3:Y${matrixValues.length + 2}`).format = {
  numberFormat: "0.000",
  borders: { preset: "all", style: "thin", color: "#E4ECF2" },
};
matrixSheet.getRange(`Z3:Z${matrixValues.length + 2}`).format = {
  numberFormat: "0.00",
  fill: "#F8FAFC",
  font: { bold: true, color: "#17324D" },
  borders: { preset: "all", style: "thin", color: "#B7CDE0" },
};
matrixSheet.getRange("A1:Z1").format.rowHeight = 28;
matrixSheet.getRange("A2:Z2").format.rowHeight = 24;
matrixSheet.getRange("A:A").format.columnWidth = 10;
matrixSheet.getRange("B:Y").format.columnWidth = 9;
matrixSheet.getRange("Z:Z").format.columnWidth = 10;
matrixSheet.freezePanes.freezeRows(2);
matrixSheet.freezePanes.freezeColumns(1);

matrixSheet.getRange(`B3:Y${matrixValues.length + 2}`).conditionalFormats.add("colorScale", {
  criteria: [
    { type: "lowestValue", color: "#E0F2FE" },
    { type: "percentile", value: 50, color: "#FEF3C7" },
    { type: "highestValue", color: "#FB923C" },
  ],
});

matrixSheet.tables.add(`A2:Z${matrixValues.length + 2}`, true, "EnergyRatioMatrix");

const noteRow = matrixValues.length + 4;
matrixSheet.getRange(`A${noteRow}:Z${noteRow}`).merge();
matrixSheet.getRange(`A${noteRow}`).values = [[
  "说明：左侧日期按用户提供的日期顺序填充；原始小时 1-24 已标准化为 00:00-23:00。",
]];
matrixSheet.getRange(`A${noteRow}:Z${noteRow}`).format = {
  fill: "#F8FAFC",
  font: { color: "#475569", italic: true },
};

longSheet.showGridLines = false;
longSheet.getRange("A1:E1").values = [["日期序号", "日期", "小时序号", "时间", "能耗占比(%)"]];
longSheet.getRange("A1:E1").format = {
  fill: "#17324D",
  font: { bold: true, color: "#FFFFFF" },
  borders: { preset: "all", style: "thin", color: "#B7CDE0" },
};

const longRows = [];
dataRows.forEach((row, dateIndex) => {
  row.slice(0, 24).forEach((value, hourIndex) => {
    longRows.push([
      dateIndex + 1,
      dateLabels[dateIndex],
      hourIndex,
      hourLabel(hourIndex),
      normalizeNumber(value),
    ]);
  });
});

longSheet.getRangeByIndexes(1, 0, longRows.length, 5).values = longRows;
longSheet.getRange(`A2:A${longRows.length + 1}`).format.numberFormat = "0";
longSheet.getRange(`C2:C${longRows.length + 1}`).format.numberFormat = "0";
longSheet.getRange(`E2:E${longRows.length + 1}`).format.numberFormat = "0.000";
longSheet.getRange(`A2:E${longRows.length + 1}`).format.borders = {
  preset: "all",
  style: "thin",
  color: "#E4ECF2",
};
longSheet.getRange("A:E").format.columnWidth = 14;
longSheet.freezePanes.freezeRows(1);
longSheet.tables.add(`A1:E${longRows.length + 1}`, true, "EnergyRatioLong");

const validation = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "formula error scan",
  maxChars: 4000,
});
await fs.writeFile(`${outputDir}/formula-error-scan.ndjson`, validation.ndjson, "utf8");

const matrixPreview = await workbook.render({
  sheetName: "能耗占比矩阵",
  range: `A1:Z${noteRow}`,
  scale: 1,
  format: "png",
});
await fs.writeFile(`${outputDir}/optimized-matrix-preview.png`, new Uint8Array(await matrixPreview.arrayBuffer()));

const longPreview = await workbook.render({
  sheetName: "监控调用长表",
  range: "A1:E30",
  scale: 1,
  format: "png",
});
await fs.writeFile(`${outputDir}/optimized-long-preview.png`, new Uint8Array(await longPreview.arrayBuffer()));

const inspect = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 8000,
  tableMaxRows: 8,
  tableMaxCols: 8,
});
await fs.writeFile(`${outputDir}/optimized-inspect.ndjson`, inspect.ndjson, "utf8");

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(inspect.ndjson);
console.log(validation.ndjson || "No formula errors found.");
console.log(outputPath);
