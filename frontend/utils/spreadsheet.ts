import type * as XLSXModule from 'xlsx';

/**
 * Reading a spreadsheet in the browser.
 *
 * Parsing happens here rather than on the server because there is no upload
 * handling in the API at all — no multipart, no temp storage — and adding it
 * plus a PHP spreadsheet library to read a few dozen rows is the wrong trade.
 * The client turns the file into a grid of strings and only ever sends JSON.
 *
 * One code path covers .xlsx, .xls and .csv: SheetJS sniffs the format. That
 * also fixes a real bug in the old hand-rolled CSV reader, which split on
 * newlines before parsing quotes and so corrupted any quoted cell containing a
 * newline — very likely in a notes column.
 */

/** A single sheet, flattened to strings. The first row is the header. */
export interface SheetGrid {
  sheetName: string;
  headers: string[];
  rows: string[][];
}

export interface SheetFile {
  sheets: SheetGrid[];
}

export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpreadsheetError';
  }
}

type Xlsx = typeof XLSXModule;

let xlsxPromise: Promise<Xlsx> | null = null;

/**
 * SheetJS is ~400KB, and only the import flow needs it, so it is fetched on
 * demand rather than bundled into the tracker's initial load. The promise is
 * cached so opening the importer twice does not re-fetch it.
 */
function loadXlsx(): Promise<Xlsx> {
  xlsxPromise ??= import('xlsx');

  return xlsxPromise;
}

/**
 * A cell as a trimmed string.
 *
 * Dates are the interesting case: with `cellDates` on, a real Excel date cell
 * arrives as a `Date` and needs no parsing at all — which is why
 * {@link parseSheetDate} only ever sees cells that were text to begin with.
 * Formatted local time is used rather than `toISOString()`, because a date-only
 * cell lands at local midnight and UTC would shift it a day backwards for
 * anyone east of Greenwich.
 */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';

    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');

    return `${value.getFullYear()}-${month}-${day}`;
  }

  if (typeof value === 'boolean') return value ? 'true' : 'false';

  return String(value).trim();
}

/**
 * Bytes in, grids out. Pure apart from the injected module, so tests can build
 * a workbook in memory and read it back without touching the filesystem.
 */
export function gridsFromWorkbook(xlsx: Xlsx, bytes: ArrayBuffer | Uint8Array): SheetFile {
  let workbook: XLSXModule.WorkBook;

  try {
    workbook = xlsx.read(bytes, { type: 'array', cellDates: true, raw: false });
  } catch {
    throw new SpreadsheetError(
      'That file could not be read as a spreadsheet. Try saving it as .xlsx or .csv.',
    );
  }

  const sheets: SheetGrid[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const table: unknown[][] = xlsx.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });

    const [headerRow = [], ...bodyRows] = table;
    const headers = headerRow.map(cellToString);

    // Pad short rows so every row is indexable by column, and drop rows that
    // are entirely blank — a trailing formula row reads as one.
    const rows = bodyRows
      .map(row => {
        const cells = row.map(cellToString);
        while (cells.length < headers.length) cells.push('');

        return cells;
      })
      .filter(cells => cells.some(cell => cell !== ''));

    sheets.push({ sheetName, headers, rows });
  }

  return { sheets };
}

/** {@link gridsFromWorkbook}, loading SheetJS itself. */
export async function readSheetBytes(bytes: ArrayBuffer | Uint8Array): Promise<SheetFile> {
  return gridsFromWorkbook(await loadXlsx(), bytes);
}

/** Read a picked file. The only DOM-dependent function here. */
export async function readSheetFile(file: File): Promise<SheetFile> {
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new SpreadsheetError('That file could not be opened.'));
    reader.readAsArrayBuffer(file);
  });

  return readSheetBytes(bytes);
}

/** A sheet with a header and at least one row of data is worth importing. */
export function isImportable(sheet: SheetGrid): boolean {
  return sheet.headers.length > 0 && sheet.rows.length > 0;
}

/**
 * The sheet an importer should open by default, or null when the file has
 * nothing importable in it.
 *
 * Two reasons this returns null rather than the first sheet regardless. A
 * workbook often leads with a notes or summary tab, and landing on an empty
 * grid looks like the file failed to read. And SheetJS does not reject a file
 * that is not a spreadsheet at all — it reads arbitrary bytes as a
 * single-cell CSV — so "no importable sheet" is how a PDF or an image
 * presents, and the caller has to be able to say so.
 */
export function defaultSheet(file: SheetFile): SheetGrid | null {
  return file.sheets.find(isImportable) ?? null;
}
