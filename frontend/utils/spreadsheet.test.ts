import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { defaultSheet, gridsFromWorkbook } from './spreadsheet';

/**
 * Workbooks are built in memory rather than committed as binary fixtures, so
 * what each test covers is readable in the test itself.
 */
function xlsxBytes(sheets: Record<string, unknown[][]>): Uint8Array {
  const book = XLSX.utils.book_new();

  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  }

  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

function csvBytes(csv: string): Uint8Array {
  return new TextEncoder().encode(csv);
}

describe('spreadsheet', () => {
  it('reads a header row and body rows from a workbook', () => {
    const { sheets } = gridsFromWorkbook(XLSX, xlsxBytes({
      Applications: [
        ['Company', 'Role', 'Status'],
        ['Acme', 'Engineer', 'Applied'],
        ['Globex', 'Developer', 'Rejected'],
      ],
    }));

    expect(sheets).toHaveLength(1);
    expect(sheets[0].sheetName).toBe('Applications');
    expect(sheets[0].headers).toEqual(['Company', 'Role', 'Status']);
    expect(sheets[0].rows).toEqual([
      ['Acme', 'Engineer', 'Applied'],
      ['Globex', 'Developer', 'Rejected'],
    ]);
  });

  it('reads a csv through the same path', () => {
    const { sheets } = gridsFromWorkbook(XLSX, csvBytes('Company,Role\nAcme,Engineer\n'));

    expect(sheets[0].headers).toEqual(['Company', 'Role']);
    expect(sheets[0].rows).toEqual([['Acme', 'Engineer']]);
  });

  it('keeps a quoted cell containing a newline intact', () => {
    // The old hand-rolled reader split on newlines before parsing quotes, so
    // any multi-line notes cell corrupted the row.
    const { sheets } = gridsFromWorkbook(
      XLSX,
      csvBytes('Company,Notes\nAcme,"first line\nsecond line"\n'),
    );

    expect(sheets[0].rows).toHaveLength(1);
    expect(sheets[0].rows[0][1]).toBe('first line\nsecond line');
  });

  it('keeps a quoted cell containing a comma intact', () => {
    const { sheets } = gridsFromWorkbook(
      XLSX,
      csvBytes('Company,Notes\nAcme,"3rd application (Apr, Jul, Sep)"\n'),
    );

    expect(sheets[0].rows[0][1]).toBe('3rd application (Apr, Jul, Sep)');
  });

  it('formats a real date cell as YYYY-MM-DD', () => {
    // A .xlsx date is a serial number, not text; SheetJS hands it back as a
    // Date and it must not shift a day across a timezone.
    const { sheets } = gridsFromWorkbook(XLSX, xlsxBytes({
      Sheet1: [['Company', 'Date Applied'], ['Acme', new Date(2026, 8, 21)]],
    }));

    expect(sheets[0].rows[0][1]).toBe('2026-09-21');
  });

  it('pads a short row so every column is indexable', () => {
    const { sheets } = gridsFromWorkbook(XLSX, csvBytes('A,B,C\n1\n'));

    expect(sheets[0].rows[0]).toEqual(['1', '', '']);
  });

  it('drops a fully blank row', () => {
    const { sheets } = gridsFromWorkbook(XLSX, csvBytes('A,B\n1,2\n,\n3,4\n'));

    expect(sheets[0].rows).toEqual([['1', '2'], ['3', '4']]);
  });

  it('exposes every sheet in a multi-sheet workbook', () => {
    const { sheets } = gridsFromWorkbook(XLSX, xlsxBytes({
      Notes: [['Just a summary tab']],
      Applications: [['Company'], ['Acme']],
    }));

    expect(sheets.map(sheet => sheet.sheetName)).toEqual(['Notes', 'Applications']);
  });

  it('defaults to the first sheet that has data rows', () => {
    const file = gridsFromWorkbook(XLSX, xlsxBytes({
      Notes: [['Just a summary tab']],
      Applications: [['Company'], ['Acme']],
    }));

    // A workbook often leads with a summary tab, and landing on an empty grid
    // looks like the file failed to read.
    expect(defaultSheet(file)?.sheetName).toBe('Applications');
  });

  it('has no importable sheet for a file that is not a spreadsheet', () => {
    // SheetJS does not reject arbitrary bytes — it reads them as a one-cell
    // CSV — so a PDF or an image presents as a sheet with no data rows rather
    // than as a thrown error, and that is what the caller has to detect.
    const file = gridsFromWorkbook(XLSX, new TextEncoder().encode('%PDF-1.4 binary junk'));

    expect(file.sheets[0].rows).toEqual([]);
    expect(defaultSheet(file)).toBeNull();
  });

  it('has no importable sheet for a file with only a header row', () => {
    expect(defaultSheet(gridsFromWorkbook(XLSX, csvBytes('Company,Role\n')))).toBeNull();
  });
});
