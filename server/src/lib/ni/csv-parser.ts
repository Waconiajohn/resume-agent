/**
 * LinkedIn CSV Parser — pure function, zero framework dependencies.
 *
 * Parses LinkedIn's "Connections" export format:
 *   First Name, Last Name, Email Address, Company, Position, Connected On
 *
 * Handles: UTF-8 BOM, quoted fields, case-insensitive headers, dedup,
 * basic company suffix stripping, LinkedIn date format (DD MMM YYYY).
 */

import type { ParsedConnection, CsvParseResult, CsvParseError } from './types.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  'first name': ['first name', 'firstname', 'first_name', 'fname'],
  'last name': ['last name', 'lastname', 'last_name', 'lname'],
  'email address': ['email address', 'email', 'email_address', 'e-mail'],
  'company': ['company', 'company name', 'current company', 'company_name', 'organization'],
  'position': ['position', 'title', 'job title', 'job_title', 'role'],
  'connected on': ['connected on', 'connected_on', 'connected date', 'connection date', 'date connected'],
};

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const SUFFIX_PATTERN = /\s*[,.]?\s*\b(Inc|LLC|Ltd|Corp|Co|PLC|GmbH|SA|BV|Pty|Limited|Incorporated|Corporation|Company)\.?\s*$/i;

// ─── CSV Field Parsing ────────────────────────────────────────────────────────

/**
 * Parse a single CSV line into fields, handling quoted fields correctly.
 * Handles commas inside quotes and escaped quotes ("").
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }

  fields.push(current.trim());
  return fields;
}

// ─── Date Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse LinkedIn date format "DD MMM YYYY" (e.g., "15 Jan 2023") into a Date.
 * Returns null on invalid/missing input.
 */
function parseLinkedInDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  const parts = dateStr.trim().split(/\s+/);
  if (parts.length !== 3) return null;

  const day = parseInt(parts[0], 10);
  const monthStr = parts[1].toLowerCase().slice(0, 3);
  const year = parseInt(parts[2], 10);

  const month = MONTH_MAP[monthStr];
  if (month === undefined || isNaN(day) || isNaN(year)) return null;
  if (day < 1 || day > 31 || year < 1900 || year > 2100) return null;

  return new Date(year, month, day);
}

// ─── Company Name Cleaning ────────────────────────────────────────────────────

/**
 * Basic company suffix stripping. Full normalization happens in company-normalizer.ts.
 */
function stripCompanySuffix(name: string): string {
  return name.replace(SUFFIX_PATTERN, '').trim();
}

// ─── Header Matching ──────────────────────────────────────────────────────────

/**
 * Map actual CSV headers to expected column indices.
 * Returns a map of expected header → actual column index, or null if required headers missing.
 */
function matchHeaders(headerFields: string[]): Map<string, number> | null {
  const lowerFields = headerFields.map((f) => f.toLowerCase().trim().replace(/\s+/g, ' '));
  const indexMap = new Map<string, number>();

  for (const [expected, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = lowerFields.findIndex((field) => aliases.includes(field));
    if (idx !== -1) {
      indexMap.set(expected, idx);
    }
  }

  // At minimum we need first name, last name, and company
  if (!indexMap.has('first name') || !indexMap.has('last name') || !indexMap.has('company')) {
    return null;
  }

  return indexMap;
}

// ─── Main Parser ──────────────────────────────────────────────────────────────

export function parseCsv(csvText: string): CsvParseResult {
  const errors: CsvParseError[] = [];
  const connections: ParsedConnection[] = [];

  // Strip UTF-8 BOM
  let text = csvText;
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // Split into lines (handle \r\n and \n)
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length === 0) {
    return { connections: [], totalRows: 0, validRows: 0, skippedRows: 0, duplicatesRemoved: 0, uniqueCompanies: 0, errors: [] };
  }

  // LinkedIn sometimes puts metadata rows before the actual header.
  // Scan the first 5 lines to find the one that matches expected headers.
  let headerMap: Map<string, number> | null = null;
  let headerLineIndex = -1;

  const scanLimit = Math.min(lines.length, 5);
  for (let attempt = 0; attempt < scanLimit; attempt++) {
    const candidateFields = parseCSVLine(lines[attempt]);
    const candidateMap = matchHeaders(candidateFields);
    if (candidateMap) {
      headerMap = candidateMap;
      headerLineIndex = attempt;
      break;
    }
  }

  if (!headerMap || headerLineIndex === -1) {
    const actualHeaders = parseCSVLine(lines[0]).map(h => h.trim()).filter(Boolean).join(', ');
    return {
      connections: [],
      totalRows: 0,
      validRows: 0,
      skippedRows: 0,
      duplicatesRemoved: 0,
      uniqueCompanies: 0,
      errors: [{
        row: 1,
        message: `Missing required headers: First Name, Last Name, Company. Found: ${actualHeaders || '(empty)'}`,
      }],
    };
  }

  const seenKeys = new Set<string>();
  let duplicatesRemoved = 0;
  const dataStartLine = headerLineIndex + 1;
  const totalRows = lines.length - dataStartLine;

  for (let i = dataStartLine; i < lines.length; i++) {
    const line = lines[i];
    const rowNum = i + 1; // 1-based row numbers

    try {
      const fields = parseCSVLine(line);

      const firstName = (fields[headerMap.get('first name')!] ?? '').trim();
      const lastName = (fields[headerMap.get('last name')!] ?? '').trim();
      const company = (fields[headerMap.get('company')!] ?? '').trim();

      // Skip rows with missing required fields
      if (!firstName || !lastName || !company) {
        errors.push({ row: rowNum, message: 'Missing required field (first name, last name, or company)' });
        continue;
      }

      // Dedup by composite key
      const dedupKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${company.toLowerCase()}`;
      if (seenKeys.has(dedupKey)) {
        duplicatesRemoved++;
        continue;
      }
      seenKeys.add(dedupKey);

      const emailIdx = headerMap.get('email address');
      const positionIdx = headerMap.get('position');
      const connectedOnIdx = headerMap.get('connected on');

      const email = emailIdx !== undefined ? (fields[emailIdx] ?? '').trim() || null : null;
      const position = positionIdx !== undefined ? (fields[positionIdx] ?? '').trim() || null : null;
      const connectedOnRaw = connectedOnIdx !== undefined ? (fields[connectedOnIdx] ?? '').trim() : '';
      const connectedOn = parseLinkedInDate(connectedOnRaw);

      connections.push({
        firstName,
        lastName,
        email,
        companyRaw: stripCompanySuffix(company),
        position,
        connectedOn,
      });
    } catch {
      errors.push({ row: rowNum, message: 'Failed to parse row' });
    }
  }

  // Count unique companies
  const uniqueCompanies = new Set(connections.map((c) => c.companyRaw.toLowerCase())).size;

  return {
    connections,
    totalRows,
    validRows: connections.length,
    skippedRows: totalRows - connections.length - duplicatesRemoved,
    duplicatesRemoved,
    uniqueCompanies,
    errors,
  };
}
