import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/hadancy/Desktop/能耗占比.xlsx";
const outputDir = "/Users/hadancy/Desktop/AI预测软件/AI-Prediction/outputs/energy_ratio_optimized";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table,region",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 12,
  tableMaxCellChars: 80,
});

await fs.writeFile(`${outputDir}/inspect-summary.ndjson`, summary.ndjson, "utf8");
console.log(summary.ndjson);

const sheets = await workbook.inspect({
  kind: "sheet",
  include: "id,name",
  maxChars: 4000,
});

const firstSheetMatch = sheets.ndjson.match(/"name":"([^"]+)"/);
const firstSheetName = firstSheetMatch?.[1] ?? "Sheet1";

const preview = await workbook.render({
  sheetName: firstSheetName,
  autoCrop: "all",
  scale: 1,
  format: "png",
});

await fs.writeFile(`${outputDir}/original-preview.png`, new Uint8Array(await preview.arrayBuffer()));
console.log(`Rendered preview for ${firstSheetName}`);
