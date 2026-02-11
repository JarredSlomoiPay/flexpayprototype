export interface OcrField<T> {
  value: T | null;
  confidence: number;
}

export interface InvoiceOcrResult {
  invoiceNumber: OcrField<string>;
  customerName: OcrField<string>;
  customerAbn: OcrField<string>;
  issueDate: OcrField<string>;
  dueDate: OcrField<string>;
  invoiceAmount: OcrField<string>;
  invoiceStatus: OcrField<string>;
}

export interface InvoiceFormPrefillValues {
  invoiceNumber: string;
  customerName: string;
  customerAbn: string;
  issueDate: string;
  dueDate: string;
  invoiceAmount: string;
  invoiceStatus: string;
}

const OCR_MIN_CONFIDENCE = 80;
const PDFJS_BASE_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build';
const TESSERACT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js';

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, value));
}

function emptyField<T>(): OcrField<T> {
  return { value: null, confidence: 0 };
}

function cleanLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

interface ParsedValue {
  value: string | null;
  confidence: number;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const DATE_TOKEN_PATTERNS = [
  /\b\d{1,4}[./-]\d{1,2}[./-]\d{2,4}\b/g,
  /\b\d{1,2}\s+[A-Za-z]{3,9}\s*,?\s*\d{2,4}\b/g,
  /\b[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{2,4}\b/g,
];

function normalizeDate(value: string): string | null {
  const raw = cleanLine(value).replace(/\./g, '/').replace(/-/g, '/');
  if (!raw) {
    return null;
  }

  let year = '';
  let month = '';
  let day = '';

  const ymd = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(raw);
  if (ymd) {
    year = ymd[1];
    month = ymd[2];
    day = ymd[3];
  } else {
    const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(raw);
    if (dmy) {
      day = dmy[1];
      month = dmy[2];
      year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    } else {
      const dayMonthText = /^(\d{1,2})\s+([A-Za-z]{3,9})\s*,?\s*(\d{2,4})$/.exec(raw);
      const monthDayText = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{2,4})$/.exec(raw);

      if (dayMonthText) {
        const monthName = dayMonthText[2].toLowerCase();
        const monthValue = MONTH_INDEX[monthName];
        if (!monthValue) {
          return null;
        }
        day = dayMonthText[1];
        month = String(monthValue);
        year = dayMonthText[3].length === 2 ? `20${dayMonthText[3]}` : dayMonthText[3];
      } else if (monthDayText) {
        const monthName = monthDayText[1].toLowerCase();
        const monthValue = MONTH_INDEX[monthName];
        if (!monthValue) {
          return null;
        }
        day = monthDayText[2];
        month = String(monthValue);
        year = monthDayText[3].length === 2 ? `20${monthDayText[3]}` : monthDayText[3];
      } else {
        return null;
      }
    }
  }

  const numericYear = Number.parseInt(year, 10);
  const numericMonth = Number.parseInt(month, 10);
  const numericDay = Number.parseInt(day, 10);
  if (
    !Number.isFinite(numericYear) ||
    !Number.isFinite(numericMonth) ||
    !Number.isFinite(numericDay) ||
    numericMonth < 1 ||
    numericMonth > 12 ||
    numericDay < 1 ||
    numericDay > 31
  ) {
    return null;
  }

  return `${String(numericYear).padStart(4, '0')}-${String(numericMonth).padStart(2, '0')}-${String(numericDay).padStart(2, '0')}`;
}

function normalizeAmount(value: string): string | null {
  const normalized = value.replace(/[^\d.,-]/g, '').replace(/,/g, '').trim();
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed.toFixed(2);
}

function getAmountTokens(line: string): string[] {
  const amountMatches = line.match(
    /\b(?:AUD|USD|NZD)?\s*\$?\s*[0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})\b/gi,
  );
  if (!amountMatches) {
    return [];
  }

  return amountMatches
    .map((token) => cleanLine(token))
    .filter((token) => !/\b(?:gst|tax)\b/i.test(token));
}

function toComparableNumber(amountValue: string): number {
  return Number.parseFloat(amountValue.replace(/,/g, ''));
}

function findAmountValue(text: string): ParsedValue {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const priorities: Array<{ keywords: string[]; confidence: number }> = [
    { keywords: ['amount due'], confidence: 95 },
    { keywords: ['total aud'], confidence: 94 },
    { keywords: ['amount inc gst', 'amount incl gst'], confidence: 93 },
    { keywords: ['total inc gst', 'total incl gst'], confidence: 91 },
    { keywords: ['total due', 'balance due'], confidence: 90 },
    { keywords: ['invoice amount'], confidence: 88 },
    { keywords: ['total'], confidence: 82 },
  ];

  for (const { keywords, confidence } of priorities) {
    const candidates: string[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lower = line.toLowerCase();
      const hasKeyword = keywords.some((keyword) => lower.includes(keyword));
      if (!hasKeyword) {
        continue;
      }
      if (/\b(?:subtotal|sub total|gst|tax|withholding|wht)\b/i.test(lower)) {
        continue;
      }

      candidates.push(...getAmountTokens(line));
      const nextLine = lines[index + 1] ?? '';
      if (nextLine && !/\b(?:subtotal|gst|tax)\b/i.test(nextLine)) {
        candidates.push(...getAmountTokens(nextLine));
      }
    }

    let bestValue: string | null = null;
    let bestNumber = -1;
    for (const token of candidates) {
      const normalized = normalizeAmount(token);
      if (!normalized) {
        continue;
      }
      const numeric = toComparableNumber(normalized);
      if (numeric > bestNumber) {
        bestNumber = numeric;
        bestValue = normalized;
      }
    }

    if (bestValue) {
      return { value: bestValue, confidence };
    }
  }

  let fallbackBest: string | null = null;
  let fallbackNumber = -1;
  for (const line of lines) {
    for (const token of getAmountTokens(line)) {
      const normalized = normalizeAmount(token);
      if (!normalized) {
        continue;
      }
      const numeric = toComparableNumber(normalized);
      if (numeric > fallbackNumber) {
        fallbackNumber = numeric;
        fallbackBest = normalized;
      }
    }
  }

  if (fallbackBest) {
    return { value: fallbackBest, confidence: 72 };
  }

  return { value: null, confidence: 0 };
}

function normalizeAbn(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) {
    return null;
  }
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

function toField<T>(value: T | null, confidence: number): OcrField<T> {
  if (value === null) {
    return emptyField<T>();
  }
  return {
    value,
    confidence: clampConfidence(confidence),
  };
}

function matchValue(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    const value = cleanLine(match?.[1] ?? '');
    if (value) {
      return value;
    }
  }
  return null;
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function getDateTokens(text: string): Array<{ raw: string; index: number; normalized: string }> {
  const tokens: Array<{ raw: string; index: number; normalized: string }> = [];
  for (const pattern of DATE_TOKEN_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const rawValue = cleanLine(match[0] ?? '');
      const normalized = normalizeDate(rawValue);
      if (!normalized) {
        continue;
      }
      tokens.push({
        raw: rawValue,
        index: match.index ?? 0,
        normalized,
      });
    }
  }
  return tokens.sort((a, b) => a.index - b.index);
}

function getIndexedLines(text: string): Array<{ value: string; index: number }> {
  const lines = text.split(/\r?\n/g);
  const indexed: Array<{ value: string; index: number }> = [];
  let offset = 0;
  for (const line of lines) {
    indexed.push({ value: cleanLine(line), index: offset });
    offset += line.length + 1;
  }
  return indexed;
}

function lineHasKeyword(line: string, keywords: string[]): boolean {
  const lower = line.toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword));
}

function extractDateFromLine(line: string): string | null {
  for (const pattern of DATE_TOKEN_PATTERNS) {
    const localPattern = new RegExp(pattern.source, 'i');
    const match = localPattern.exec(line);
    if (match?.[0]) {
      const normalized = normalizeDate(match[0]);
      if (normalized) {
        return normalized;
      }
    }
  }
  return null;
}

function findDateByKeywords(
  text: string,
  keywords: string[],
  fallbackConfidence: number,
  nextLineConfidence: number,
): ParsedValue {
  const lines = getIndexedLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].value;
    if (!line || !lineHasKeyword(line, keywords)) {
      continue;
    }

    const inlineDate = extractDateFromLine(line);
    if (inlineDate) {
      return { value: inlineDate, confidence: fallbackConfidence };
    }

    const nextLine = lines[index + 1]?.value ?? '';
    const nextLineDate = extractDateFromLine(nextLine);
    if (nextLineDate) {
      return { value: nextLineDate, confidence: nextLineConfidence };
    }
  }

  return { value: null, confidence: 0 };
}

function findIssueDateValue(text: string): ParsedValue {
  const strict = findDateByKeywords(
    text,
    ['issue date', 'invoice date', 'date issued', 'issued on'],
    94,
    90,
  );
  if (strict.value) {
    return strict;
  }

  const genericDateLine = findDateByKeywords(text, ['date'], 84, 80);
  if (genericDateLine.value) {
    return genericDateLine;
  }

  const tokens = getDateTokens(text);
  if (tokens.length > 0) {
    return { value: tokens[0].normalized, confidence: 70 };
  }

  return { value: null, confidence: 0 };
}

function parseNetTermsDays(text: string): number | null {
  const patterns = [
    /(?:payment\s+terms?|terms?)\s*[:\-]?\s*net\s*(\d{1,3})\b/i,
    /\bnet\s*(\d{1,3})\b/i,
    /(?:payment\s+terms?|terms?)\s*[:\-]?\s*(\d{1,3})\s*days?\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match?.[1]) {
      continue;
    }
    const days = Number.parseInt(match[1], 10);
    if (Number.isFinite(days) && days > 0 && days <= 365) {
      return days;
    }
  }
  return null;
}

function addDaysFromIso(isoDate: string, days: number): string | null {
  const date = toDate(isoDate);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function findDueDateValue(text: string, issueDate: string | null): ParsedValue {
  const strict = findDateByKeywords(
    text,
    ['due date', 'payment due', 'pay by', 'due on', 'balance due', 'please pay by', 'due'],
    94,
    90,
  );
  if (strict.value) {
    return strict;
  }

  const netDays = parseNetTermsDays(text);
  if (issueDate && netDays) {
    const computed = addDaysFromIso(issueDate, netDays);
    if (computed) {
      return { value: computed, confidence: 86 };
    }
  }

  const tokens = getDateTokens(text);
  if (tokens.length === 0) {
    return { value: null, confidence: 0 };
  }

  if (!issueDate) {
    return { value: tokens[tokens.length - 1].normalized, confidence: 72 };
  }

  const issue = toDate(issueDate);
  const candidatesAfterIssue = tokens
    .map((token) => token.normalized)
    .filter((date) => {
      const candidate = toDate(date);
      if (!Number.isFinite(candidate.getTime())) {
        return false;
      }
      const diffMs = candidate.getTime() - issue.getTime();
      const maxDueWindowMs = 365 * 24 * 60 * 60 * 1000;
      return diffMs > 0 && diffMs <= maxDueWindowMs;
    });

  if (candidatesAfterIssue.length > 0) {
    return { value: candidatesAfterIssue[candidatesAfterIssue.length - 1], confidence: 74 };
  }

  return { value: null, confidence: 0 };
}

function normalizeCustomerName(value: string): string {
  let normalized = cleanLine(value)
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\b(?:abn|acn)\b.*$/i, '')
    .replace(/[,;:.-]+$/g, '')
    .trim();

  // OCR sometimes merges the label with the value, e.g. "Customer ACME Pty Ltd".
  normalized = normalized.replace(
    /^(?:(?:customer(?:\s+name)?)|(?:bill\s*to)|(?:billed\s*to)|(?:invoice\s*to)|(?:sold\s*to)|recipient|client|company|to)\s*[:\-]?\s+/i,
    '',
  );

  return normalized.trim();
}

function normalizeLabelToken(value: string): string {
  return cleanLine(value)
    .toLowerCase()
    .replace(/[0]/g, 'o')
    .replace(/[1|]/g, 'l')
    .replace(/[5]/g, 's')
    .replace(/[^a-z]/g, '');
}

function isCustomerLabelToken(token: string): boolean {
  if (!token) {
    return false;
  }
  const labels = ['customer', 'customername', 'billto', 'billedto', 'invoiceto', 'soldto', 'recipient', 'client', 'customerto', 'shipto'];
  return labels.some((label) => token.startsWith(label) || token.includes(label));
}

function isSupplierLabelToken(token: string): boolean {
  if (!token) {
    return false;
  }
  const labels = ['from', 'supplier', 'seller', 'vendor', 'remitto', 'issuer', 'ourdetails', 'payee'];
  return labels.some((label) => token.startsWith(label) || token.includes(label));
}

function isNonCustomerFieldLabelToken(token: string): boolean {
  if (!token) {
    return false;
  }
  const labels = [
    'invoice',
    'invoicenumber',
    'amount',
    'amountdue',
    'total',
    'duedate',
    'issuedate',
    'date',
    'abn',
    'acn',
    'paymentadvice',
    'accountnumber',
    'accountno',
    'remittanceadvice',
  ];
  return labels.some((label) => token.startsWith(label) || token.includes(label));
}

function extractLabeledValue(line: string): { labelToken: string; value: string } {
  const cleaned = cleanLine(line);
  const separatorMatch = /^(.{1,40}?)(?:[:\-]| {2,}|\t+)(.+)$/.exec(cleaned);
  if (!separatorMatch?.[1] || !separatorMatch[2]) {
    return { labelToken: '', value: '' };
  }
  return {
    labelToken: normalizeLabelToken(separatorMatch[1]),
    value: cleanLine(separatorMatch[2]),
  };
}

function isAddressOrMetaLine(value: string): boolean {
  const line = cleanLine(value);
  if (!line) {
    return true;
  }
  if (/@/.test(line) || /\b(?:www\.|http)/i.test(line)) {
    return true;
  }

  const lower = line.toLowerCase();

  const metaPatterns = [
    /\b(?:invoice|total|amount|due|date|abn|acn|tax|gst|phone|mobile|email|statement|balance)\b/i,
    /\b(?:payment\s*advice|remittance\s*advice)\b/i,
    /\b(?:account\s*(?:number|no))\b/i,
    /\bpo\s*box\b/i,
    /\b(?:suburb|state|postcode|post\s*code)\b/i,
  ];
  if (metaPatterns.some((pattern) => pattern.test(lower))) {
    return true;
  }

  const addressWordPatterns = [
    /\b(?:street|road|avenue|drive|lane|boulevard)\b/i,
    /\b(?:st|rd|ave|dr|ln|blvd)\.?\b/i,
  ];
  const startsWithStreetNumber = /^\d{1,5}\s+\w+/.test(line);
  if (startsWithStreetNumber && addressWordPatterns.some((pattern) => pattern.test(lower))) {
    return true;
  }

  const digitCount = (line.match(/\d/g) ?? []).length;
  return digitCount >= 6 || /^[^A-Za-z]*$/.test(line);
}

function scoreCustomerNameCandidate(value: string): number {
  const cleaned = normalizeCustomerName(value);
  if (!isLikelyCustomerName(cleaned)) {
    return -1;
  }

  let score = 0;
  if (/\b(?:pty|limited|ltd|llc|inc|group|co|company)\b/i.test(cleaned)) {
    score += 4;
  }
  if (/^[A-Z0-9 '&.-]+$/.test(cleaned)) {
    score += 1;
  }
  if (/[A-Za-z]{4,}\s+[A-Za-z]{3,}/.test(cleaned)) {
    score += 2;
  }
  if (!/\d{3,}/.test(cleaned)) {
    score += 1;
  } else {
    score -= 2;
  }
  if (cleaned.length >= 10 && cleaned.length <= 60) {
    score += 1;
  }

  return score;
}

function isLikelyCustomerName(value: string): boolean {
  const cleaned = normalizeCustomerName(value);
  if (!cleaned || cleaned.length < 3 || cleaned.length > 90) {
    return false;
  }
  const genericTokens = [
    'customer',
    'customername',
    'billto',
    'billedto',
    'invoiceto',
    'soldto',
    'recipient',
    'client',
    'company',
    'name',
    'to',
    'from',
    'supplier',
    'vendor',
    'payee',
  ];
  const compact = cleaned.toLowerCase().replace(/[^a-z]/g, '');
  if (genericTokens.includes(compact)) {
    return false;
  }
  if (/\b(?:payment\s*advice|remittance|account\s*(?:number|no)|statement)\b/i.test(cleaned)) {
    return false;
  }
  if (!/[A-Za-z]/.test(cleaned)) {
    return false;
  }
  if (/\d{4,}/.test(cleaned)) {
    return false;
  }
  return !isAddressOrMetaLine(cleaned);
}

function findCustomerName(text: string): ParsedValue {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => cleanLine(line))
    .filter(Boolean);

  const customerLabelIndexes: number[] = [];
  const supplierLabelIndexes: number[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const extracted = extractLabeledValue(line);
    if (isCustomerLabelToken(extracted.labelToken)) {
      customerLabelIndexes.push(index);
      const directName = normalizeCustomerName(extracted.value);
      if (isLikelyCustomerName(directName)) {
        return { value: directName, confidence: 92 };
      }
    }
    if (isSupplierLabelToken(extracted.labelToken)) {
      supplierLabelIndexes.push(index);
    }

    const token = normalizeLabelToken(line);
    if (isCustomerLabelToken(token)) {
      customerLabelIndexes.push(index);
      const inlineCandidate = normalizeCustomerName(line);
      if (isLikelyCustomerName(inlineCandidate)) {
        return { value: inlineCandidate, confidence: 93 };
      }

      let bestNearby: { value: string; score: number } | null = null;
      for (let lookahead = 1; lookahead <= 8; lookahead += 1) {
        const candidateLine = lines[index + lookahead];
        if (!candidateLine) {
          break;
        }
        const candidateToken = normalizeLabelToken(candidateLine);
        if (isNonCustomerFieldLabelToken(candidateToken) && !isCustomerLabelToken(candidateToken)) {
          continue;
        }

        const candidateName = normalizeCustomerName(candidateLine);
        if (!isLikelyCustomerName(candidateName)) {
          continue;
        }

        let score = scoreCustomerNameCandidate(candidateName) - lookahead * 0.15;
        if (/\.[a-z]{2,}(?:\.[a-z]{2,})?$/i.test(candidateName)) {
          score += 3;
        }

        if (!bestNearby || score > bestNearby.score) {
          bestNearby = { value: candidateName, score };
        }
      }

      if (bestNearby) {
        return { value: bestNearby.value, confidence: 89 };
      }
    }
    if (isSupplierLabelToken(token)) {
      supplierLabelIndexes.push(index);
    }
  }

  const hasCustomerAnchor = customerLabelIndexes.length > 0;
  const firstCustomerAnchor = hasCustomerAnchor ? Math.min(...customerLabelIndexes) : -1;

  const isNearSupplierAnchor = (lineIndex: number): boolean =>
    supplierLabelIndexes.some((supplierIndex) => Math.abs(supplierIndex - lineIndex) <= 3);

  const isNearCustomerAnchor = (lineIndex: number): boolean =>
    customerLabelIndexes.some((customerIndex) => Math.abs(customerIndex - lineIndex) <= 4);

  let bestCandidate: string | null = null;
  let bestScore = -1;
  const scanLimit = Math.min(lines.length, 45);
  for (let index = 0; index < scanLimit; index += 1) {
    const candidateRaw = lines[index];
    const candidate = normalizeCustomerName(candidateRaw);
    let score = scoreCustomerNameCandidate(candidate);
    if (score < 0) {
      continue;
    }

    if (isNearCustomerAnchor(index)) {
      score += 5;
    }
    if (isNearSupplierAnchor(index)) {
      score -= 6;
    }
    if (hasCustomerAnchor && index < firstCustomerAnchor) {
      score -= 3;
    }
    if (lineHasKeyword(candidate, ['tax invoice', 'invoice'])) {
      score -= 4;
    }
    if (index <= 3 && !isNearCustomerAnchor(index)) {
      score -= 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestCandidate && bestScore >= 5) {
    return { value: bestCandidate, confidence: hasCustomerAnchor ? 82 : 76 };
  }

  if (hasCustomerAnchor) {
    for (const anchorIndex of customerLabelIndexes) {
      for (let lookahead = 1; lookahead <= 5; lookahead += 1) {
        const candidate = normalizeCustomerName(lines[anchorIndex + lookahead] ?? '');
        if (isLikelyCustomerName(candidate) && !isNearSupplierAnchor(anchorIndex + lookahead)) {
          return { value: candidate, confidence: 79 };
        }
      }
    }
  }

  return { value: null, confidence: 0 };
}

export function parseInvoiceText(text: string, baseConfidence = 75): InvoiceOcrResult {
  const invoiceNumberRaw = matchValue(text, [
    /invoice(?:\s*(?:no|number|#))?\s*[:\-]\s*([A-Z]{2,6}[- ]?\d{3,10})/i,
    /\b(INV[- ]?\d{3,10})\b/i,
  ]);
  const abnRaw = matchValue(text, [
    /abn\s*[:\-]?\s*(\d{2}\s?\d{3}\s?\d{3}\s?\d{3})/i,
    /\b(\d{2}\s\d{3}\s\d{3}\s\d{3})\b/,
  ]);

  const customerNameValue = findCustomerName(text);
  const issueDateValue = findIssueDateValue(text);
  const dueDateValue = findDueDateValue(text, issueDateValue.value);
  const amountValue = findAmountValue(text);

  const invoiceNumber = invoiceNumberRaw
    ? invoiceNumberRaw.replace(/\s+/g, '').replace(/-/, '-').toUpperCase()
    : null;
  const invoiceAmount = amountValue.value;
  const customerAbn = abnRaw ? normalizeAbn(abnRaw) : null;
  const customerName = customerNameValue.value;
  const issueDate = issueDateValue.value;
  const dueDate = dueDateValue.value;

  return {
    invoiceNumber: toField(invoiceNumber, baseConfidence + 8),
    customerName: toField(customerName, baseConfidence + customerNameValue.confidence - 75),
    customerAbn: toField(customerAbn, baseConfidence + 6),
    issueDate: toField(issueDate, baseConfidence + issueDateValue.confidence - 75),
    dueDate: toField(dueDate, baseConfidence + dueDateValue.confidence - 75),
    invoiceAmount: toField(invoiceAmount, baseConfidence + amountValue.confidence - 75),
    invoiceStatus: emptyField<string>(),
  };
}

async function recognizeImageSource(imageSource: string): Promise<{ text: string; confidence: number }> {
  const tesseractModule = await import(/* @vite-ignore */ TESSERACT_MODULE_URL);
  const tesseract = tesseractModule.default ?? tesseractModule;
  const result = await tesseract.recognize(imageSource, 'eng', { logger: () => undefined });
  const text = String(result?.data?.text ?? '');
  const confidence = clampConfidence(Number(result?.data?.confidence ?? 0));
  return { text, confidence };
}

async function runPdfOcr(file: File): Promise<{ text: string; confidence: number }> {
  const pdfjs = await import(/* @vite-ignore */ `${PDFJS_BASE_URL}/pdf.min.mjs`);
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE_URL}/pdf.worker.min.mjs`;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data: bytes }).promise;
  const pageTexts: string[] = [];
  let confidenceTotal = 0;

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) {
      continue;
    }
    await page.render({ canvasContext: context, viewport }).promise;
    const { text, confidence } = await recognizeImageSource(canvas.toDataURL('image/png'));
    pageTexts.push(text);
    confidenceTotal += confidence;
  }

  const averageConfidence = pdf.numPages > 0 ? confidenceTotal / pdf.numPages : 0;
  return {
    text: pageTexts.join('\n'),
    confidence: clampConfidence(averageConfidence),
  };
}

async function runImageOcr(file: File): Promise<{ text: string; confidence: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    return await recognizeImageSource(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function extractInvoiceFieldsFromFile(file: File): Promise<InvoiceOcrResult> {
  try {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/');

    let text = '';
    let confidence = 0;

    if (isPdf) {
      const result = await runPdfOcr(file);
      text = result.text;
      confidence = result.confidence;
    } else if (isImage) {
      const result = await runImageOcr(file);
      text = result.text;
      confidence = result.confidence;
    } else {
      text = await file.text();
      confidence = 70;
    }

    return parseInvoiceText(text, confidence || 70);
  } catch {
    return {
      invoiceNumber: emptyField<string>(),
      customerName: emptyField<string>(),
      customerAbn: emptyField<string>(),
      issueDate: emptyField<string>(),
      dueDate: emptyField<string>(),
      invoiceAmount: emptyField<string>(),
      invoiceStatus: emptyField<string>(),
    };
  }
}

export function toInvoiceFormPrefillValues(
  result: InvoiceOcrResult,
  confidenceThreshold = OCR_MIN_CONFIDENCE,
): InvoiceFormPrefillValues {
  const threshold = clampConfidence(confidenceThreshold);
  const fieldValue = (field: OcrField<string>): string =>
    field.value && field.confidence >= threshold ? field.value : '';

  return {
    invoiceNumber: fieldValue(result.invoiceNumber),
    customerName: fieldValue(result.customerName),
    customerAbn: fieldValue(result.customerAbn),
    issueDate: fieldValue(result.issueDate),
    dueDate: fieldValue(result.dueDate),
    invoiceAmount: fieldValue(result.invoiceAmount),
    invoiceStatus: fieldValue(result.invoiceStatus),
  };
}
