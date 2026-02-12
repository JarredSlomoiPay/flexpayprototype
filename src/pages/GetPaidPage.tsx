import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ReferencePage } from '../components/ReferencePage';
import { ensureGetPaidSidebarItem, wireHeaderLogout, wireLocalAnchors } from '../lib/domHelpers';
import { extractInvoiceFieldsFromFile, toInvoiceFormPrefillValues } from '../lib/invoiceOcr';
import { referenceAssets } from '../lib/referenceAssets';

interface InvoiceTerm {
  days: number;
  rate: number;
}

interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerAbn: string;
  issueDate: string;
  dueDate: string;
  invoiceAmount: number;
  invoiceStatus: string;
  earlyTerms: InvoiceTerm[];
  lateTerms: InvoiceTerm[];
}

const INITIAL_INVOICES: InvoiceRecord[] = [
  {
    id: 'inv-row-001',
    invoiceNumber: 'INV-10087',
    customerName: 'Acme Supplies Pty Ltd',
    customerAbn: '57 184 923 115',
    issueDate: '2026-02-01',
    dueDate: '2026-03-11',
    invoiceAmount: 1890,
    invoiceStatus: 'Sent',
    earlyTerms: [{ days: 15, rate: 1.25 }],
    lateTerms: [{ days: 15, rate: 3 }],
  },
];

const statusOptions = ['Draft', 'Sent', 'Overdue', 'Paid'];
const PAYREWARDS_MARGIN = 0.25;
const PAYREWARDS_POINT_VALUE = 0.0075;

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function parseAmount(value: string): number {
  const normalized = value.replace(/\$/g, '').replace(/,/g, '').trim();
  return Number.parseFloat(normalized);
}

function formatAmountInput(value: string): string {
  const sanitized = value.replace(/[^\d.]/g, '');
  if (!sanitized) {
    return '';
  }

  const [rawWhole, ...rawDecimals] = sanitized.split('.');
  const wholeDigits = rawWhole.replace(/^0+(?=\d)/, '');
  const normalizedWhole = wholeDigits || '0';
  const wholeNumber = Number.parseInt(normalizedWhole, 10);
  const formattedWhole = Number.isFinite(wholeNumber)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(wholeNumber)
    : normalizedWhole;

  if (rawDecimals.length === 0) {
    return formattedWhole;
  }

  return `${formattedWhole}.${rawDecimals.join('').slice(0, 2)}`;
}

function formatAmountForBlur(value: string): string {
  const parsed = parseAmount(value);
  if (!Number.isFinite(parsed)) {
    return '';
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatPoints(value: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateFromDate(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const year = value.getFullYear();
  return `${day}/${month}/${year}`;
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function GetPaidPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const wireUp = useCallback(
    (root: HTMLElement) => {
      const cleanups: Array<() => void> = [];
      ensureGetPaidSidebarItem(root, true);
      cleanups.push(wireLocalAnchors(root, navigate));
      cleanups.push(wireHeaderLogout(root, signOut));

      const appRouter = root.querySelector<HTMLElement>('#_app-router');
      if (!appRouter) {
        return () => {
          for (const cleanup of cleanups) {
            cleanup();
          }
        };
      }

      appRouter.innerHTML = `
        <section class="MuiBox-root css-tuzxzp">
          <div class="MuiContainer-root MuiContainer-maxWidthLg css-1qsxih2">
            <div class="flexpay-invoices-toolbar">
              <h3 class="MuiTypography-root MuiTypography-h3 css-s63vx1 flexpay-invoices-title">Invoices</h3>
              <button type="button" class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary MuiButton-sizeMedium MuiButton-containedSizeMedium MuiButton-colorPrimary css-kuiouy flexpay-add-invoice-trigger" data-testid="add-invoice-button">Add invoice</button>
            </div>
            <div class="flexpay-invoice-form-card" data-testid="add-invoice-form" hidden>
              <h5 class="flexpay-card-title">New invoice</h5>
              <form class="flexpay-invoice-form" novalidate>
                <div class="flexpay-ocr-upload" data-testid="invoice-ocr-upload">
                  <div class="flexpay-ocr-upload-main">
                    <div class="flexpay-ocr-upload-header">
                      <p class="flexpay-terms-label">Upload invoice</p>
                      <p class="flexpay-terms-helper">Drag and drop a PDF/image invoice or upload a file to prefill fields with OCR.</p>
                    </div>
                    <div class="flexpay-dropzone" data-testid="invoice-dropzone" role="button" tabindex="0">
                      <input type="file" class="flexpay-file-input" data-testid="invoice-file-input" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" />
                      <div class="flexpay-dropzone-content">
                        <p class="flexpay-dropzone-idle-text">Drop invoice here or <span class="flexpay-dropzone-link">choose file</span></p>
                        <p class="flexpay-dropzone-file-name" data-testid="invoice-dropzone-file-name"></p>
                        <div class="flexpay-dropzone-loading-content" aria-hidden="true">
                          <span class="flexpay-ocr-spinner" aria-hidden="true"></span>
                          <span class="flexpay-dropzone-loading-text" data-testid="invoice-dropzone-loading-text"></span>
                        </div>
                      </div>
                    </div>
                    <p class="flexpay-ocr-status" data-testid="invoice-ocr-status"></p>
                  </div>
                  <div class="flexpay-invoice-preview" data-testid="invoice-preview" hidden>
                    <div class="flexpay-invoice-preview-frame">
                      <img class="flexpay-invoice-preview-image" data-testid="invoice-preview-image" alt="" hidden />
                      <iframe class="flexpay-invoice-preview-pdf" data-testid="invoice-preview-pdf" title="Invoice preview" loading="lazy" hidden></iframe>
                    </div>
                  </div>
                </div>
                <div class="flexpay-grid">
                  <label class="flexpay-field">
                    <span>Invoice number</span>
                    <input id="invoice-number" name="invoiceNumber" type="text" required />
                  </label>
                  <label class="flexpay-field">
                    <span>Customer name</span>
                    <input id="customer-name" name="customerName" type="text" required />
                  </label>
                  <label class="flexpay-field">
                    <span>Customer ABN</span>
                    <input id="customer-abn" name="customerAbn" type="text" required />
                  </label>
                  <label class="flexpay-field">
                    <span>Issue date</span>
                    <input id="issue-date" name="issueDate" type="date" required />
                  </label>
                  <label class="flexpay-field">
                    <span>Due date</span>
                    <input id="due-date" name="dueDate" type="date" required />
                  </label>
                  <div class="flexpay-field">
                    <label for="invoice-amount">Invoice amount</label>
                    <div class="flexpay-currency-input-wrap">
                      <span class="flexpay-currency-prefix" aria-hidden="true">$</span>
                      <input
                        id="invoice-amount"
                        name="invoiceAmount"
                        type="text"
                        inputmode="decimal"
                        placeholder="0.00"
                        required
                      />
                    </div>
                  </div>
                  <label class="flexpay-field">
                    <span>Invoice status</span>
                    <select id="invoice-status" name="invoiceStatus" required>
                      <option value="">Select status</option>
                      ${statusOptions.map((status) => `<option value="${status}">${status}</option>`).join('')}
                    </select>
                  </label>
                </div>
                <div class="flexpay-terms">
                  <div class="flexpay-terms-intro">
                    <p class="flexpay-terms-label">Flex Pay</p>
                    <p class="flexpay-terms-helper">Encourage your customers to pay you early with Bonus points or provide them with flexible extended terms to receive additional PayRewards points.</p>
                  </div>
                  <div class="flexpay-term-group">
                    <div class="flexpay-term-group-header">
                      <h6>FlexPay terms - early (optional)</h6>
                      <button type="button" class="flexpay-link-btn" data-testid="add-early-term">+ Add early term</button>
                    </div>
                    <div class="flexpay-term-list" data-term-list="early"></div>
                  </div>
                  <div class="flexpay-term-group">
                    <div class="flexpay-term-group-header">
                      <h6>FlexPay terms - late (optional)</h6>
                      <button type="button" class="flexpay-link-btn" data-testid="add-late-term">+ Add late term</button>
                    </div>
                    <div class="flexpay-term-list" data-term-list="late"></div>
                  </div>
                </div>
                <div class="flexpay-error-box" data-testid="invoice-form-errors"></div>
                <div class="flexpay-form-actions">
                  <button type="button" class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedPrimary css-mjqjpq flexpay-secondary-btn" data-testid="cancel-add-invoice">Cancel</button>
                  <button type="submit" class="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-containedPrimary css-kuiouy flexpay-primary-btn" data-testid="save-invoice-button">Save invoice</button>
                </div>
              </form>
            </div>
            <div class="flexpay-table-card flexpay-table-card--invoice">
              <div class="flexpay-invoice-filters" data-testid="invoice-filters">
                <label class="flexpay-filter-field">
                  <span>Search</span>
                  <input type="text" placeholder="Invoice number, customer name, amount" />
                </label>
                <label class="flexpay-filter-field">
                  <span>Due date from</span>
                  <div class="flexpay-filter-input-wrap">
                    <input type="text" placeholder="DD/MM/YYYY" />
                    <span class="flexpay-filter-icon">📅</span>
                  </div>
                </label>
                <label class="flexpay-filter-field">
                  <span>Due date to</span>
                  <div class="flexpay-filter-input-wrap">
                    <input type="text" placeholder="DD/MM/YYYY" />
                    <span class="flexpay-filter-icon">📅</span>
                  </div>
                </label>
                <label class="flexpay-filter-field">
                  <span>Status</span>
                  <select aria-label="status-filter">
                    <option>All</option>
                    ${statusOptions.map((status) => `<option>${status}</option>`).join('')}
                  </select>
                </label>
                <div class="flexpay-filter-actions">
                  <button type="button" class="flexpay-filter-apply">Apply</button>
                  <button type="button" class="flexpay-filter-reset">Reset</button>
                </div>
              </div>
              <div class="flexpay-table-scroll-wrap">
                <table class="flexpay-invoice-table" data-testid="invoice-table">
                  <thead>
                    <tr>
                      <th>Invoice number</th>
                      <th>Customer name</th>
                      <th>Customer ABN</th>
                      <th>Issue date</th>
                      <th>Due date</th>
                      <th>Invoice amount</th>
                      <th>Invoice status</th>
                      <th>FlexPay</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody data-testid="invoice-table-body"></tbody>
                </table>
              </div>
              <div class="flexpay-table-footer">
                <span>Rows per page:</span>
                <span>10</span>
                <span>1–7 of 7</span>
                <span class="flexpay-footer-arrows">‹</span>
                <span class="flexpay-footer-arrows">›</span>
              </div>
            </div>
          </div>
        </section>
      `;

      let invoices = [...INITIAL_INVOICES];

      const addInvoiceButton = appRouter.querySelector<HTMLButtonElement>('[data-testid="add-invoice-button"]');
      const formCard = appRouter.querySelector<HTMLElement>('[data-testid="add-invoice-form"]');
      const tableCard = appRouter.querySelector<HTMLElement>('.flexpay-table-card--invoice');
      const invoiceForm = appRouter.querySelector<HTMLFormElement>('form.flexpay-invoice-form');
      const tableBody = appRouter.querySelector<HTMLTableSectionElement>('[data-testid="invoice-table-body"]');
      const formErrors = appRouter.querySelector<HTMLElement>('[data-testid="invoice-form-errors"]');
      const earlyTermsList = appRouter.querySelector<HTMLElement>('[data-term-list="early"]');
      const lateTermsList = appRouter.querySelector<HTMLElement>('[data-term-list="late"]');
      const invoiceNumberInput = appRouter.querySelector<HTMLInputElement>('#invoice-number');
      const customerNameInput = appRouter.querySelector<HTMLInputElement>('#customer-name');
      const customerAbnInput = appRouter.querySelector<HTMLInputElement>('#customer-abn');
      const issueDateInput = appRouter.querySelector<HTMLInputElement>('#issue-date');
      const invoiceAmountInput = appRouter.querySelector<HTMLInputElement>('#invoice-amount');
      const dueDateInput = appRouter.querySelector<HTMLInputElement>('#due-date');
      const invoiceStatusSelect = appRouter.querySelector<HTMLSelectElement>('#invoice-status');
      const ocrUpload = appRouter.querySelector<HTMLElement>('[data-testid="invoice-ocr-upload"]');
      const dropzone = appRouter.querySelector<HTMLElement>('[data-testid="invoice-dropzone"]');
      const fileInput = appRouter.querySelector<HTMLInputElement>('[data-testid="invoice-file-input"]');
      const ocrStatus = appRouter.querySelector<HTMLElement>('[data-testid="invoice-ocr-status"]');
      const dropzoneFileName = appRouter.querySelector<HTMLElement>('[data-testid="invoice-dropzone-file-name"]');
      const dropzoneLoadingText = appRouter.querySelector<HTMLElement>(
        '[data-testid="invoice-dropzone-loading-text"]',
      );
      const invoicePreview = appRouter.querySelector<HTMLElement>('[data-testid="invoice-preview"]');
      const invoicePreviewImage = appRouter.querySelector<HTMLImageElement>('[data-testid="invoice-preview-image"]');
      const invoicePreviewPdf = appRouter.querySelector<HTMLIFrameElement>('[data-testid="invoice-preview-pdf"]');
      const addEarlyTermButton = appRouter.querySelector<HTMLButtonElement>('[data-testid="add-early-term"]');
      const addLateTermButton = appRouter.querySelector<HTMLButtonElement>('[data-testid="add-late-term"]');
      const cancelButton = appRouter.querySelector<HTMLButtonElement>('[data-testid="cancel-add-invoice"]');

      if (
        !addInvoiceButton ||
        !formCard ||
        !tableCard ||
        !invoiceForm ||
        !tableBody ||
        !formErrors ||
        !earlyTermsList ||
        !lateTermsList ||
        !invoiceNumberInput ||
        !customerNameInput ||
        !customerAbnInput ||
        !issueDateInput ||
        !invoiceAmountInput ||
        !dueDateInput ||
        !invoiceStatusSelect ||
        !ocrUpload ||
        !dropzone ||
        !fileInput ||
        !ocrStatus ||
        !dropzoneFileName ||
        !dropzoneLoadingText ||
        !invoicePreview ||
        !invoicePreviewImage ||
        !invoicePreviewPdf ||
        !addEarlyTermButton ||
        !addLateTermButton ||
        !cancelButton
      ) {
        return () => {
          for (const cleanup of cleanups) {
            cleanup();
          }
        };
      }

      const clearTermRows = (list: HTMLElement) => {
        list.innerHTML = '';
      };

      let invoicePreviewUrl: string | null = null;

      const clearInvoicePreview = () => {
        if (invoicePreviewUrl && typeof URL.revokeObjectURL === 'function') {
          URL.revokeObjectURL(invoicePreviewUrl);
        }
        invoicePreviewUrl = null;
        ocrUpload.classList.remove('flexpay-ocr-upload--with-preview');
        invoicePreview.hidden = true;
        invoicePreviewImage.hidden = true;
        invoicePreviewImage.removeAttribute('src');
        invoicePreviewImage.alt = '';
        invoicePreviewPdf.hidden = true;
        invoicePreviewPdf.removeAttribute('src');
      };

      const renderInvoicePreview = (file: File) => {
        clearInvoicePreview();

        const isPdfFile = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        const isImageFile = file.type.startsWith('image/') || /\.(png|jpe?g)$/i.test(file.name);

        if ((!isPdfFile && !isImageFile) || typeof URL.createObjectURL !== 'function') {
          return;
        }

        invoicePreviewUrl = URL.createObjectURL(file);
        ocrUpload.classList.add('flexpay-ocr-upload--with-preview');
        invoicePreview.hidden = false;

        if (isPdfFile) {
          invoicePreviewPdf.src = invoicePreviewUrl;
          invoicePreviewPdf.hidden = false;
          return;
        }

        invoicePreviewImage.src = invoicePreviewUrl;
        invoicePreviewImage.alt = `Preview of ${file.name}`;
        invoicePreviewImage.hidden = false;
      };

      const applyInvoicePrefill = (file: File) => {
        const setStatus = (message: string, isError = false) => {
          ocrStatus.textContent = message;
          ocrStatus.classList.toggle('flexpay-ocr-status-error', isError);
        };

        const setLoading = (isLoading: boolean) => {
          dropzone.classList.toggle('flexpay-dropzone-loading', isLoading);
          dropzone.setAttribute('aria-busy', isLoading ? 'true' : 'false');
          fileInput.disabled = isLoading;
          ocrStatus.classList.toggle('flexpay-ocr-status-loading', isLoading);
          dropzoneLoadingText.textContent = isLoading
            ? `Scanning ${file.name} for invoice fields...`
            : '';
        };

        const setInputValue = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
          if (!value) {
            return;
          }
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const setAmountInputValue = (value: string) => {
          if (!value) {
            return;
          }
          const formatted = formatAmountForBlur(value);
          invoiceAmountInput.value = formatted || formatAmountInput(value);
          invoiceAmountInput.dispatchEvent(new Event('input', { bubbles: true }));
          invoiceAmountInput.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const process = async () => {
          const acceptedTypes = ['application/pdf', 'image/png', 'image/jpeg'];
          const isAccepted =
            acceptedTypes.includes(file.type) ||
            /\.(pdf|png|jpe?g)$/i.test(file.name);

          if (!isAccepted) {
            clearInvoicePreview();
            setStatus('Unsupported file type. Upload PDF, PNG or JPG/JPEG.', true);
            return;
          }

          renderInvoicePreview(file);

          try {
            setLoading(true);
            setStatus('Processing invoice with OCR...');
            dropzoneFileName.textContent = `Selected file: ${file.name}`;
            const result = await extractInvoiceFieldsFromFile(file);
            const prefill = toInvoiceFormPrefillValues(result, 80);
            const populatedValues = Object.values(prefill).filter(Boolean);

            setInputValue(invoiceNumberInput, prefill.invoiceNumber);
            setInputValue(customerNameInput, prefill.customerName);
            setInputValue(customerAbnInput, prefill.customerAbn);
            setInputValue(issueDateInput, prefill.issueDate);
            setInputValue(dueDateInput, prefill.dueDate);
            setAmountInputValue(prefill.invoiceAmount);
            setInputValue(invoiceStatusSelect, prefill.invoiceStatus);

            updateAllTermRowDayLabels();
            updateAllTermRowCalculations();
            setStatus(
              `OCR complete. ${populatedValues.length} field${populatedValues.length === 1 ? '' : 's'} populated. Review and edit any values as needed.`,
            );
          } catch {
            setStatus('Unable to process this invoice. Please fill details manually.', true);
          } finally {
            setLoading(false);
          }
        };

        void process();
      };

      const updateTermRowDaysLabel = (row: HTMLElement, type: 'early' | 'late') => {
        const label = row.querySelector<HTMLElement>('.flexpay-term-days-label');
        const daysInput = row.querySelector<HTMLInputElement>('.flexpay-term-days');
        const dueDateValue = dueDateInput.value.trim();
        const defaultText =
          type === 'early'
            ? 'Days early (payment before XX/XX/XXXX)'
            : 'Days late (payment after XX/XX/XXXX)';

        if (!label || !daysInput) {
          return;
        }

        const parsedDays = Number.parseInt(daysInput.value.trim(), 10);
        if (!dueDateValue || !Number.isFinite(parsedDays) || parsedDays <= 0) {
          label.textContent = defaultText;
          return;
        }

        const dueDate = new Date(`${dueDateValue}T00:00:00`);
        if (!Number.isFinite(dueDate.getTime())) {
          label.textContent = defaultText;
          return;
        }

        const paymentDate = addDays(dueDate, type === 'early' ? -parsedDays : parsedDays);
        const direction = type === 'early' ? 'before' : 'after';
        label.textContent = `Days ${type} (payment ${direction} ${formatDateFromDate(paymentDate)})`;
      };

      const updateTermRowCalculations = (row: HTMLElement, type: 'early' | 'late') => {
        const rateInput = row.querySelector<HTMLInputElement>('.flexpay-term-rate');
        const primaryOutput = row.querySelector<HTMLElement>('[data-term-output="primary"]');
        const secondaryOutput = row.querySelector<HTMLElement>('[data-term-output="secondary"]');
        const invoiceAmount = parseAmount(invoiceAmountInput.value);

        if (!rateInput || !primaryOutput || !secondaryOutput) {
          return;
        }

        const rate = Number.parseFloat(rateInput.value);
        const shouldShowEmpty = !Number.isFinite(invoiceAmount) || invoiceAmount <= 0 || !Number.isFinite(rate) || rate < 0;

        if (shouldShowEmpty) {
          primaryOutput.textContent = '—';
          secondaryOutput.textContent = '—';
          return;
        }

        const value = invoiceAmount * (rate / 100);
        const points = Math.round((1 - PAYREWARDS_MARGIN) * (value / PAYREWARDS_POINT_VALUE));

        if (type === 'early') {
          primaryOutput.textContent = formatPoints(points);
          secondaryOutput.textContent = formatCurrency(value);
          return;
        }

        primaryOutput.textContent = formatCurrency(value);
        secondaryOutput.textContent = formatPoints(points);
      };

      const updateAllTermRowCalculations = () => {
        for (const row of earlyTermsList.querySelectorAll<HTMLElement>('.flexpay-term-row')) {
          updateTermRowCalculations(row, 'early');
        }
        for (const row of lateTermsList.querySelectorAll<HTMLElement>('.flexpay-term-row')) {
          updateTermRowCalculations(row, 'late');
        }
      };

      const updateAllTermRowDayLabels = () => {
        for (const row of earlyTermsList.querySelectorAll<HTMLElement>('.flexpay-term-row')) {
          updateTermRowDaysLabel(row, 'early');
        }
        for (const row of lateTermsList.querySelectorAll<HTMLElement>('.flexpay-term-row')) {
          updateTermRowDaysLabel(row, 'late');
        }
      };

      const createTermRow = (type: 'early' | 'late'): HTMLElement => {
        const row = document.createElement('div');
        row.className = 'flexpay-term-row';
        row.innerHTML = `
          <label>
            <span class="flexpay-term-days-label">${
              type === 'early'
                ? 'Days early (payment before XX/XX/XXXX)'
                : 'Days late (payment after XX/XX/XXXX)'
            }</span>
            <input type="number" min="1" step="1" class="flexpay-term-days" />
          </label>
          <label>
            <span>${type === 'early' ? 'Bonus rate (%)' : 'Fee rate (%)'}</span>
            <input type="number" min="0" step="0.01" class="flexpay-term-rate" />
          </label>
          <div class="flexpay-term-output">
            <span>${type === 'early' ? 'Customer earns (PayRewards Points)' : 'Customer pays (dollar value)'}</span>
            <p class="flexpay-term-calculated" data-term-output="primary">—</p>
          </div>
          <div class="flexpay-term-output">
            <span>${type === 'early' ? 'You pay (deducted from remittance)' : 'You earn (PayRewards Points)'}</span>
            <p class="flexpay-term-calculated" data-term-output="secondary">—</p>
          </div>
          <button type="button" class="flexpay-link-btn flexpay-remove-term">Remove</button>
        `;

        const removeButton = row.querySelector<HTMLButtonElement>('.flexpay-remove-term');
        const daysInput = row.querySelector<HTMLInputElement>('.flexpay-term-days');
        const rateInput = row.querySelector<HTMLInputElement>('.flexpay-term-rate');

        const recalculateHandler = () => {
          updateTermRowDaysLabel(row, type);
          updateTermRowCalculations(row, type);
        };

        daysInput?.addEventListener('input', recalculateHandler);
        rateInput?.addEventListener('input', recalculateHandler);
        cleanups.push(() => daysInput?.removeEventListener('input', recalculateHandler));
        cleanups.push(() => rateInput?.removeEventListener('input', recalculateHandler));

        if (removeButton) {
          const removeHandler = () => {
            row.remove();
          };
          removeButton.addEventListener('click', removeHandler);
          cleanups.push(() => removeButton.removeEventListener('click', removeHandler));
        }

        updateTermRowDaysLabel(row, type);
        updateTermRowCalculations(row, type);
        return row;
      };

      const renderTable = () => {
        tableBody.innerHTML = invoices
          .map(
            (invoice) => `
              <tr data-testid="invoice-row-${escapeHtml(invoice.id)}">
                <td>${escapeHtml(invoice.invoiceNumber)}</td>
                <td>${escapeHtml(invoice.customerName)}</td>
                <td>${escapeHtml(invoice.customerAbn)}</td>
                <td>${escapeHtml(formatDate(invoice.issueDate))}</td>
                <td>${escapeHtml(formatDate(invoice.dueDate))}</td>
                <td>${escapeHtml(formatCurrency(invoice.invoiceAmount))}</td>
                <td>${escapeHtml(invoice.invoiceStatus)}</td>
                <td class="flexpay-flexpay-flag">
                  <span
                    class="flexpay-flexpay-badge ${invoice.earlyTerms.length > 0 || invoice.lateTerms.length > 0 ? 'is-active' : 'is-inactive'}"
                    aria-label="${invoice.earlyTerms.length > 0 || invoice.lateTerms.length > 0 ? 'FlexPay enabled' : 'FlexPay not enabled'}"
                  >${invoice.earlyTerms.length > 0 || invoice.lateTerms.length > 0 ? '✓' : ''}</span>
                </td>
                <td class="flexpay-row-actions">⋮</td>
              </tr>
            `,
          )
          .join('');
      };

      const hideForm = () => {
        formCard.hidden = true;
        tableCard.hidden = false;
        invoiceForm.reset();
        formErrors.innerHTML = '';
        dropzoneFileName.textContent = '';
        dropzoneLoadingText.textContent = '';
        dropzone.classList.remove('flexpay-dropzone-loading', 'flexpay-dropzone-dragover');
        dropzone.removeAttribute('aria-busy');
        fileInput.disabled = false;
        ocrStatus.textContent = '';
        ocrStatus.classList.remove('flexpay-ocr-status-error', 'flexpay-ocr-status-loading');
        clearInvoicePreview();
        clearTermRows(earlyTermsList);
        clearTermRows(lateTermsList);
      };

      const showForm = () => {
        formCard.hidden = false;
        tableCard.hidden = true;
      };

      const collectTerms = (
        list: HTMLElement,
        kind: 'Early' | 'Late',
        rateLabel: 'bonus rate' | 'fee rate',
        errors: string[],
      ): InvoiceTerm[] => {
        const result: InvoiceTerm[] = [];

        for (const row of list.querySelectorAll<HTMLElement>('.flexpay-term-row')) {
          const daysInput = row.querySelector<HTMLInputElement>('.flexpay-term-days');
          const rateInput = row.querySelector<HTMLInputElement>('.flexpay-term-rate');

          if (!daysInput || !rateInput) {
            continue;
          }

          const daysValue = daysInput.value.trim();
          const rateValue = rateInput.value.trim();

          if (!daysValue && !rateValue) {
            continue;
          }

          if (!daysValue || !rateValue) {
            errors.push(`${kind} terms require both days and ${rateLabel}.`);
            continue;
          }

          const days = Number.parseInt(daysValue, 10);
          const rate = Number.parseFloat(rateValue);

          if (!Number.isFinite(days) || days <= 0) {
            errors.push(`${kind} term days must be greater than 0.`);
            continue;
          }

          if (!Number.isFinite(rate) || rate < 0) {
            errors.push(`${kind} ${rateLabel} must be 0 or greater.`);
            continue;
          }

          result.push({ days, rate });
        }

        return result;
      };

      renderTable();

      const showFormHandler = () => {
        showForm();
      };
      addInvoiceButton.addEventListener('click', showFormHandler);
      cleanups.push(() => addInvoiceButton.removeEventListener('click', showFormHandler));

      const cancelHandler = () => {
        hideForm();
      };
      cancelButton.addEventListener('click', cancelHandler);
      cleanups.push(() => cancelButton.removeEventListener('click', cancelHandler));

      const addEarlyTermHandler = () => {
        earlyTermsList.appendChild(createTermRow('early'));
      };
      addEarlyTermButton.addEventListener('click', addEarlyTermHandler);
      cleanups.push(() => addEarlyTermButton.removeEventListener('click', addEarlyTermHandler));

      const addLateTermHandler = () => {
        lateTermsList.appendChild(createTermRow('late'));
      };
      addLateTermButton.addEventListener('click', addLateTermHandler);
      cleanups.push(() => addLateTermButton.removeEventListener('click', addLateTermHandler));

      const dropzoneClickHandler = () => {
        fileInput.click();
      };
      dropzone.addEventListener('click', dropzoneClickHandler);
      cleanups.push(() => dropzone.removeEventListener('click', dropzoneClickHandler));

      const dropzoneKeydownHandler = (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
          return;
        }
        event.preventDefault();
        fileInput.click();
      };
      dropzone.addEventListener('keydown', dropzoneKeydownHandler);
      cleanups.push(() => dropzone.removeEventListener('keydown', dropzoneKeydownHandler));

      const dragOverHandler = (event: DragEvent) => {
        event.preventDefault();
        dropzone.classList.add('flexpay-dropzone-dragover');
      };
      dropzone.addEventListener('dragover', dragOverHandler);
      cleanups.push(() => dropzone.removeEventListener('dragover', dragOverHandler));

      const dragLeaveHandler = () => {
        dropzone.classList.remove('flexpay-dropzone-dragover');
      };
      dropzone.addEventListener('dragleave', dragLeaveHandler);
      cleanups.push(() => dropzone.removeEventListener('dragleave', dragLeaveHandler));

      const dropHandler = (event: DragEvent) => {
        event.preventDefault();
        dropzone.classList.remove('flexpay-dropzone-dragover');
        const file = event.dataTransfer?.files?.[0];
        if (file) {
          applyInvoicePrefill(file);
        }
      };
      dropzone.addEventListener('drop', dropHandler);
      cleanups.push(() => dropzone.removeEventListener('drop', dropHandler));

      const fileInputChangeHandler = () => {
        const file = fileInput.files?.[0];
        if (!file) {
          return;
        }
        applyInvoicePrefill(file);
      };
      fileInput.addEventListener('change', fileInputChangeHandler);
      cleanups.push(() => fileInput.removeEventListener('change', fileInputChangeHandler));

      const invoiceAmountInputHandler = () => {
        const formatted = formatAmountInput(invoiceAmountInput.value);
        if (invoiceAmountInput.value !== formatted) {
          invoiceAmountInput.value = formatted;
        }
        updateAllTermRowCalculations();
      };
      invoiceAmountInput.addEventListener('input', invoiceAmountInputHandler);
      cleanups.push(() => invoiceAmountInput.removeEventListener('input', invoiceAmountInputHandler));

      const invoiceAmountBlurHandler = () => {
        invoiceAmountInput.value = formatAmountForBlur(invoiceAmountInput.value);
        updateAllTermRowCalculations();
      };
      invoiceAmountInput.addEventListener('blur', invoiceAmountBlurHandler);
      cleanups.push(() => invoiceAmountInput.removeEventListener('blur', invoiceAmountBlurHandler));

      const dueDateInputHandler = () => {
        updateAllTermRowDayLabels();
      };
      dueDateInput.addEventListener('input', dueDateInputHandler);
      cleanups.push(() => dueDateInput.removeEventListener('input', dueDateInputHandler));

      const submitHandler = (event: Event) => {
        event.preventDefault();
        formErrors.innerHTML = '';

        const formData = new FormData(invoiceForm);
        const invoiceNumber = String(formData.get('invoiceNumber') ?? '').trim();
        const customerName = String(formData.get('customerName') ?? '').trim();
        const customerAbn = String(formData.get('customerAbn') ?? '').trim();
        const issueDate = String(formData.get('issueDate') ?? '').trim();
        const dueDate = String(formData.get('dueDate') ?? '').trim();
        const invoiceAmountRaw = String(formData.get('invoiceAmount') ?? '').trim();
        const invoiceStatus = String(formData.get('invoiceStatus') ?? '').trim();
        const invoiceAmount = parseAmount(invoiceAmountRaw);

        const errors: string[] = [];

        if (!invoiceNumber) {
          errors.push('Invoice number is required.');
        }
        if (!customerName) {
          errors.push('Customer name is required.');
        }
        if (!customerAbn) {
          errors.push('Customer ABN is required.');
        }
        if (!issueDate) {
          errors.push('Issue date is required.');
        }
        if (!dueDate) {
          errors.push('Due date is required.');
        }
        if (!invoiceAmountRaw || !Number.isFinite(invoiceAmount) || invoiceAmount <= 0) {
          errors.push('Invoice amount must be greater than 0.');
        }
        if (!invoiceStatus) {
          errors.push('Invoice status is required.');
        }

        const earlyTerms = collectTerms(earlyTermsList, 'Early', 'bonus rate', errors);
        const lateTerms = collectTerms(lateTermsList, 'Late', 'fee rate', errors);

        if (errors.length > 0) {
          formErrors.innerHTML = errors.map((error) => `<p>${escapeHtml(error)}</p>`).join('');
          return;
        }

        const record: InvoiceRecord = {
          id: `inv-row-${Date.now()}`,
          invoiceNumber,
          customerName,
          customerAbn,
          issueDate,
          dueDate,
          invoiceAmount,
          invoiceStatus,
          earlyTerms,
          lateTerms,
        };

        invoices = [record, ...invoices];
        renderTable();
        hideForm();
      };

      invoiceForm.addEventListener('submit', submitHandler);
      cleanups.push(() => invoiceForm.removeEventListener('submit', submitHandler));

      return () => {
        clearInvoicePreview();
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    },
    [navigate, signOut],
  );

  return (
    <ReferencePage sourceHtml={referenceAssets.newPaymentHtml} wireUp={wireUp} styleId="get-paid" />
  );
}
