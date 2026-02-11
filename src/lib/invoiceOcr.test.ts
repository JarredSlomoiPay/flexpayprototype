import { describe, expect, it } from 'vitest';
import { parseInvoiceText } from './invoiceOcr';

describe('invoiceOcr parser', () => {
  it('extracts customer name from bill-to block and due date with month text', () => {
    const text = `
      TAX INVOICE
      Bill To
      Northwind Trade Co Pty Ltd
      88 George Street
      Sydney NSW 2000

      Invoice Date: 01/02/2026
      Please pay by 15 Mar 2026
      Total: $1,000.00
    `;

    const result = parseInvoiceText(text, 85);

    expect(result.customerName.value).toBe('Northwind Trade Co Pty Ltd');
    expect(result.dueDate.value).toBe('2026-03-15');
    expect(result.customerName.confidence).toBeGreaterThanOrEqual(80);
    expect(result.dueDate.confidence).toBeGreaterThanOrEqual(80);
  });

  it('calculates due date from payment terms when due date is missing', () => {
    const text = `
      INVOICE TO: Acme Supplies Pty Ltd
      ABN: 57 184 923 115
      Date Issued: 2026-01-20
      Payment Terms: Net 30
      Amount Due: $245.75
    `;

    const result = parseInvoiceText(text, 82);

    expect(result.customerName.value).toBe('Acme Supplies Pty Ltd');
    expect(result.issueDate.value).toBe('2026-01-20');
    expect(result.dueDate.value).toBe('2026-02-19');
  });

  it('falls back to a likely later invoice date when explicit due label is absent', () => {
    const text = `
      Customer Name: Bright Line Retail
      Invoice Date: 05/01/2026
      Ship Date: 07/01/2026
      Statement date: 12/02/2026
      Total: $670.00
    `;

    const result = parseInvoiceText(text, 80);

    expect(result.customerName.value).toBe('Bright Line Retail');
    expect(result.issueDate.value).toBe('2026-01-05');
    expect(result.dueDate.value).toBe('2026-02-12');
  });

  it('does not reject customer names containing "st" substrings', () => {
    const text = `
      TAX INVOICE
      Bill To
      West Coast Trading Pty Ltd
      12 King Street
      Perth WA 6000

      Invoice Date: 18/02/2026
      Due Date: 20/03/2026
      Total Due: $2,340.00
    `;

    const result = parseInvoiceText(text, 82);

    expect(result.customerName.value).toBe('West Coast Trading Pty Ltd');
    expect(result.customerName.confidence).toBeGreaterThanOrEqual(80);
  });

  it('prefers customer section over supplier/payee section', () => {
    const text = `
      FROM: Payee Holdings Pty Ltd
      ABN: 11 111 111 111
      99 Collins Street Melbourne VIC 3000

      INVOICE
      Blll T0
      Customer One Manufacturing Pty Ltd
      22 River Road Brisbane QLD 4000

      Invoice Date: 02/03/2026
      Due Date: 01/04/2026
      Total Due: $9,500.00
    `;

    const result = parseInvoiceText(text, 84);

    expect(result.customerName.value).toBe('One Manufacturing Pty Ltd');
    expect(result.customerName.value).not.toBe('Payee Holdings Pty Ltd');
    expect(result.customerName.confidence).toBeGreaterThanOrEqual(80);
  });

  it('does not capture generic placeholder words such as "Customer" as the customer name', () => {
    const text = `
      INVOICE
      Bill To
      Customer
      Acme Components Pty Ltd
      Invoice Date: 06/03/2026
      Due Date: 05/04/2026
      Total: $430.00
    `;

    const result = parseInvoiceText(text, 84);

    expect(result.customerName.value).toBe('Acme Components Pty Ltd');
    expect(result.customerName.value).not.toBe('Customer');
  });

  it('strips merged customer label prefix from detected customer name', () => {
    const text = `
      INVOICE
      Bill To
      Customer Pay.com.au Limited
      Invoice Date: 10/03/2026
      Due Date: 09/04/2026
      Total: $1,234.00
    `;

    const result = parseInvoiceText(text, 84);

    expect(result.customerName.value).toBe('Pay.com.au Limited');
    expect(result.customerName.value).not.toMatch(/^customer\s/i);
  });

  it('does not treat payment advice/account number line as customer name', () => {
    const text = `
      INVOICE
      Invoice Number: INV-8842
      PAYMENT ADVICE Account Number 10231

      Bill To
      Delta Manufacturing Pty Ltd

      Invoice Date: 11/03/2026
      Due Date: 10/04/2026
      Total Due: AUD 4,560.00
    `;

    const result = parseInvoiceText(text, 84);

    expect(result.customerName.value).toBe('Delta Manufacturing Pty Ltd');
    expect(result.customerName.value).not.toContain('PAYMENT ADVICE');
    expect(result.customerName.value).not.toContain('Account Number');
  });

  it('prioritizes amount due, total aud, and amount inc gst for invoice amount', () => {
    const text = `
      INVOICE
      Invoice Number: INV-9912
      Subtotal: AUD 1,800.00
      GST: AUD 180.00
      Amount inc GST: AUD 1,980.00
      Total AUD: AUD 2,010.00
      Amount Due: AUD 1,990.00
    `;

    const result = parseInvoiceText(text, 84);

    // Amount Due should win over Total AUD / Amount inc GST.
    expect(result.invoiceAmount.value).toBe('1990.00');
    expect(result.invoiceAmount.confidence).toBeGreaterThanOrEqual(80);
  });

  it('extracts customer value when customer label and value appear on the same line', () => {
    const text = `
      Swivel Group Pty Ltd
      Customer pay.com.au
      Invoice Number INV-2982
      Amount Due 10,890.00
    `;

    const result = parseInvoiceText(text, 84);

    expect(result.customerName.value).toBe('pay.com.au');
    expect(result.customerName.value).not.toContain('Swivel Group');
  });

  it('extracts customer value when customer label is above and value is below', () => {
    const text = `
      Swivel Group Pty Ltd
      Customer
      Invoice Number
      Amount Due
      pay.com.au
      INV-2982
      10,890.00
    `;

    const result = parseInvoiceText(text, 84);

    expect(result.customerName.value).toBe('pay.com.au');
    expect(result.customerName.value).not.toContain('Swivel Group');
  });
});
