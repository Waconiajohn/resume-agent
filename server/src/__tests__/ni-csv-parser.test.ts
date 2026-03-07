import { describe, it, expect } from 'vitest';
import { parseCsv } from '../lib/ni/csv-parser.js';

const STANDARD_HEADER = 'First Name,Last Name,Email Address,Company,Position,Connected On';

// Build a single data row string from named parts
function makeRow(
  firstName: string,
  lastName: string,
  email: string,
  company: string,
  position: string,
  connectedOn: string,
): string {
  return `${firstName},${lastName},${email},${company},${position},${connectedOn}`;
}

describe('parseCsv', () => {
  // ── 1. Empty CSV ────────────────────────────────────────────────────────────
  it('returns zeroed result for an empty string', () => {
    const result = parseCsv('');
    expect(result.connections).toHaveLength(0);
    expect(result.totalRows).toBe(0);
    expect(result.validRows).toBe(0);
    expect(result.skippedRows).toBe(0);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  // ── 2. Header-only CSV (no data rows) ───────────────────────────────────────
  it('returns zeroed result when only the header row is present', () => {
    const result = parseCsv(STANDARD_HEADER);
    expect(result.connections).toHaveLength(0);
    expect(result.totalRows).toBe(0);
    expect(result.validRows).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  // ── 3. Standard 5-row CSV with all LinkedIn fields ──────────────────────────
  it('parses a standard 5-row CSV correctly', () => {
    const rows = [
      makeRow('Alice', 'Adams', 'alice@example.com', 'Acme Corp', 'Engineer', '15 Jan 2023'),
      makeRow('Bob', 'Baker', 'bob@example.com', 'Beta Ltd', 'Manager', '02 Mar 2022'),
      makeRow('Carol', 'Clark', 'carol@example.com', 'Gamma Inc', 'Director', '20 Jun 2021'),
      makeRow('Dave', 'Davis', 'dave@example.com', 'Delta Co', 'VP Sales', '11 Sep 2020'),
      makeRow('Eve', 'Evans', 'eve@example.com', 'Epsilon LLC', 'CTO', '30 Dec 2019'),
    ];
    const csv = [STANDARD_HEADER, ...rows].join('\n');
    const result = parseCsv(csv);

    expect(result.totalRows).toBe(5);
    expect(result.validRows).toBe(5);
    expect(result.skippedRows).toBe(0);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.errors).toHaveLength(0);

    const alice = result.connections[0];
    expect(alice.firstName).toBe('Alice');
    expect(alice.lastName).toBe('Adams');
    expect(alice.email).toBe('alice@example.com');
    expect(alice.position).toBe('Engineer');
    expect(alice.connectedOn).toBeInstanceOf(Date);
    expect(alice.connectedOn?.getFullYear()).toBe(2023);
    expect(alice.connectedOn?.getMonth()).toBe(0); // January
    expect(alice.connectedOn?.getDate()).toBe(15);
  });

  // ── 4. UTF-8 BOM handling ────────────────────────────────────────────────────
  it('strips the UTF-8 BOM character from the start of the file', () => {
    const bom = '\uFEFF';
    const csv = bom + STANDARD_HEADER + '\n' + makeRow('Jane', 'Smith', '', 'TechCo', 'Lead', '01 Jan 2024');
    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toBe(1);
    expect(result.connections[0].firstName).toBe('Jane');
  });

  // ── 5. Special characters — accents and escaped quotes ──────────────────────
  it('handles accented characters and quoted fields with embedded quotes', () => {
    // Company name with an embedded comma and escaped double-quote, inside quotes
    const csv =
      STANDARD_HEADER +
      '\n' +
      'José,García,,\"Müller & ""Partners""\",Senior Consultant,10 Feb 2023';
    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toBe(1);

    const conn = result.connections[0];
    expect(conn.firstName).toBe('José');
    expect(conn.lastName).toBe('García');
    // Embedded "" should be collapsed to a single "
    expect(conn.companyRaw).toContain('Müller');
    expect(conn.companyRaw).toContain('"Partners"');
  });

  // ── 6. Malformed rows — missing required fields ──────────────────────────────
  it('skips rows missing first name, last name, or company and records an error', () => {
    const rows = [
      // Missing first name
      makeRow('', 'Brown', 'b@x.com', 'ACME', 'Analyst', '01 Jan 2023'),
      // Missing company
      makeRow('Tom', 'Turner', 't@x.com', '', 'Analyst', '01 Jan 2023'),
      // Valid row
      makeRow('Sam', 'Stone', 's@x.com', 'ValidCo', 'Dev', '01 Jan 2023'),
    ];
    const csv = [STANDARD_HEADER, ...rows].join('\n');
    const result = parseCsv(csv);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(1);
    expect(result.skippedRows).toBe(2);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[1].row).toBe(3);
    expect(result.connections[0].firstName).toBe('Sam');
  });

  // ── 7. Duplicate detection ───────────────────────────────────────────────────
  it('removes duplicate rows with the same name + company combination', () => {
    const rows = [
      makeRow('Kim', 'Lee', 'kim1@x.com', 'Contoso', 'Engineer', '01 Jan 2023'),
      makeRow('Kim', 'Lee', 'kim2@x.com', 'Contoso', 'Engineer', '15 Jan 2023'), // dup
      makeRow('Kim', 'Lee', '', 'Contoso', 'Lead', '20 Feb 2023'),               // dup (company same)
      makeRow('Kim', 'Lee', 'kim3@x.com', 'OtherCo', 'Engineer', '01 Jan 2023'), // different company — not dup
    ];
    const csv = [STANDARD_HEADER, ...rows].join('\n');
    const result = parseCsv(csv);

    expect(result.totalRows).toBe(4);
    expect(result.validRows).toBe(2);
    expect(result.duplicatesRemoved).toBe(2);
    expect(result.connections.map((c) => c.companyRaw)).toEqual(
      expect.arrayContaining(['Contoso', 'OtherCo']),
    );
  });

  // ── 8. Large CSV performance ─────────────────────────────────────────────────
  it('parses 2000 rows in under 500 ms', () => {
    const rows: string[] = [STANDARD_HEADER];
    for (let i = 0; i < 2000; i++) {
      rows.push(makeRow(`First${i}`, `Last${i}`, `u${i}@x.com`, `Company${i % 50}`, 'Engineer', '01 Jan 2023'));
    }
    const csv = rows.join('\n');

    const start = Date.now();
    const result = parseCsv(csv);
    const elapsed = Date.now() - start;

    expect(result.totalRows).toBe(2000);
    expect(elapsed).toBeLessThan(500);
  });

  // ── 9. Date parsing — various LinkedIn "DD MMM YYYY" formats ────────────────
  it('parses all 12 month abbreviations correctly', () => {
    const months = [
      ['Jan', 0], ['Feb', 1], ['Mar', 2], ['Apr', 3],
      ['May', 4], ['Jun', 5], ['Jul', 6], ['Aug', 7],
      ['Sep', 8], ['Oct', 9], ['Nov', 10], ['Dec', 11],
    ] as const;

    for (const [abbr, expectedMonth] of months) {
      const csv = STANDARD_HEADER + '\n' + makeRow('A', 'B', '', 'Co', 'T', `15 ${abbr} 2022`);
      const result = parseCsv(csv);
      expect(result.errors).toHaveLength(0);
      const date = result.connections[0].connectedOn;
      expect(date).not.toBeNull();
      expect(date?.getMonth()).toBe(expectedMonth);
      expect(date?.getDate()).toBe(15);
      expect(date?.getFullYear()).toBe(2022);
    }
  });

  it('stores null for an unrecognised or missing date', () => {
    const rows = [
      makeRow('A', 'B', '', 'Co', 'T', 'not-a-date'),
      makeRow('C', 'D', '', 'Co', 'T', ''),
    ];
    const csv = [STANDARD_HEADER, ...rows].join('\n');
    const result = parseCsv(csv);

    expect(result.validRows).toBe(2);
    expect(result.connections[0].connectedOn).toBeNull();
    expect(result.connections[1].connectedOn).toBeNull();
  });

  // ── 10. Company suffix stripping ─────────────────────────────────────────────
  it('strips common legal suffixes from company names', () => {
    const suffixCases: Array<[string, string]> = [
      ['Acme Inc', 'Acme'],
      ['Beta LLC', 'Beta'],
      ['Gamma Ltd', 'Gamma'],
      ['Delta Corp', 'Delta'],
      ['Epsilon Co', 'Epsilon'],
      ['Zeta PLC', 'Zeta'],
      ['Eta GmbH', 'Eta'],
      ['Theta Limited', 'Theta'],
      ['Iota Incorporated', 'Iota'],
      ['Kappa Corporation', 'Kappa'],
    ];

    for (const [rawCompany, expectedStripped] of suffixCases) {
      const csv = STANDARD_HEADER + '\n' + makeRow('X', 'Y', '', rawCompany, 'Dev', '01 Jan 2024');
      const result = parseCsv(csv);
      expect(result.errors).toHaveLength(0);
      expect(result.connections[0].companyRaw).toBe(expectedStripped);
    }
  });

  // ── 11. Extra columns beyond the standard 6 ──────────────────────────────────
  it('ignores extra columns that appear after the standard 6', () => {
    const headerWithExtra = STANDARD_HEADER + ',Notes,Source,Tags';
    const rowWithExtra = makeRow('Anna', 'Bell', 'a@b.com', 'NovaCo', 'PM', '05 May 2023') + ',some note,LinkedIn,vip';
    const csv = [headerWithExtra, rowWithExtra].join('\n');
    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toBe(1);
    const conn = result.connections[0];
    expect(conn.firstName).toBe('Anna');
    expect(conn.companyRaw).toBe('NovaCo');
  });

  // ── 12. Case-insensitive header matching ─────────────────────────────────────
  it('matches headers regardless of capitalisation', () => {
    const weirdCaseHeader = 'FIRST NAME,last name,Email Address,COMPANY,position,Connected On';
    const csv = weirdCaseHeader + '\n' + makeRow('Raj', 'Patel', 'r@p.com', 'TechFirm', 'Architect', '10 Oct 2023');
    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toBe(1);
    expect(result.connections[0].firstName).toBe('Raj');
    expect(result.connections[0].companyRaw).toBe('TechFirm');
  });

  // ── 13. Empty company field (should skip row) ─────────────────────────────────
  it('skips every row where the company column is empty', () => {
    const rows = [
      makeRow('Alice', 'A', '', '', 'Dev', '01 Jan 2023'),
      makeRow('Bob', 'B', '', '   ', 'Dev', '01 Jan 2023'), // whitespace-only
      makeRow('Carol', 'C', '', 'RealCo', 'Dev', '01 Jan 2023'),
    ];
    const csv = [STANDARD_HEADER, ...rows].join('\n');
    const result = parseCsv(csv);

    expect(result.validRows).toBe(1);
    expect(result.skippedRows).toBe(2);
    expect(result.connections[0].firstName).toBe('Carol');
  });

  // ── 14. Quoted fields with commas inside ─────────────────────────────────────
  it('parses quoted fields that contain commas without splitting the column', () => {
    // Company name is "Smith, Jones & Associates" — comma inside quotes
    const csv =
      STANDARD_HEADER +
      '\n' +
      '"Mary","Williams","m@w.com","Smith, Jones & Associates","Partner","12 Nov 2022"';
    const result = parseCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.validRows).toBe(1);
    const conn = result.connections[0];
    expect(conn.firstName).toBe('Mary');
    expect(conn.companyRaw).toBe('Smith, Jones & Associates');
    expect(conn.position).toBe('Partner');
  });
});
