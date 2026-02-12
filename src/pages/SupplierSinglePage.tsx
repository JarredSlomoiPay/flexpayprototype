import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ReferencePage } from '../components/ReferencePage';
import {
  ensureGetPaidSidebarItem,
  findButtonByText,
  wireHeaderLogout,
  wireLocalAnchors,
} from '../lib/domHelpers';
import { referenceAssets } from '../lib/referenceAssets';

interface InvoiceOption {
  id: string;
  label: string;
  amount: string;
  reference: string;
  dueDate: string;
  hasFlexPayTerms: boolean;
}

interface PayeeOption {
  id: string;
  name: string;
}

interface NormalizedPaymentForm {
  payee: string;
  amount: string;
  description: string;
  reference: string;
  schedule: string;
}

const PAYREWARDS_MARGIN = 0.25;

const PAYEE_OPTIONS: PayeeOption[] = [
  { id: 'acme-supplies', name: 'Acme Supplies Pty Ltd' },
  { id: 'northwind-trade', name: 'Northwind Trade Co' },
  { id: 'atlas-logistics', name: 'Atlas Logistics Group' },
  { id: 'harbor-electrical', name: 'Harbor Electrical Services' },
  { id: 'silver-fern', name: 'Silver Fern Manufacturing' },
  { id: 'blue-ridge', name: 'Blue Ridge Foods' },
  { id: 'nova-civil', name: 'Nova Civil Contractors' },
  { id: 'summit-office', name: 'Summit Office Supplies' },
  { id: 'coastal-clean', name: 'Coastal Clean Facilities' },
  { id: 'metro-it', name: 'Metro IT Solutions' },
  { id: 'cedar-wholesale', name: 'Cedar Wholesale Pty Ltd' },
  { id: 'urban-print', name: 'Urban Print Works' },
  { id: 'prairie-freight', name: 'Prairie Freight Co' },
  { id: 'aurora-trade', name: 'Aurora Trade Partners' },
  { id: 'golden-grain', name: 'Golden Grain Distributors' },
];

const INVOICES_BY_PAYEE: Record<string, InvoiceOption[]> = {
  'acme-supplies': [
    {
      id: 'inv-10087',
      label: 'INV-10087',
      amount: '1890.00',
      reference: 'INV-10087',
      dueDate: '2026-03-11',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10104',
      label: 'INV-10104',
      amount: '59.90',
      reference: 'INV-10104',
      dueDate: '2026-04-02',
      hasFlexPayTerms: false,
    },
  ],
  'northwind-trade': [
    {
      id: 'inv-10021',
      label: 'INV-10021',
      amount: '245.75',
      reference: 'INV-10021',
      dueDate: '2026-02-19',
      hasFlexPayTerms: true,
    },
  ],
  'atlas-logistics': [],
  'harbor-electrical': [
    {
      id: 'inv-10111',
      label: 'INV-10111',
      amount: '980.00',
      reference: 'INV-10111',
      dueDate: '2026-03-25',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10112',
      label: 'INV-10112',
      amount: '4200.25',
      reference: 'INV-10112',
      dueDate: '2026-04-05',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10113',
      label: 'INV-10113',
      amount: '315.40',
      reference: 'INV-10113',
      dueDate: '2026-04-21',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10114',
      label: 'INV-10114',
      amount: '1560.00',
      reference: 'INV-10114',
      dueDate: '2026-05-06',
      hasFlexPayTerms: true,
    },
  ],
  'silver-fern': [],
  'blue-ridge': [
    {
      id: 'inv-10121',
      label: 'INV-10121',
      amount: '742.90',
      reference: 'INV-10121',
      dueDate: '2026-03-30',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10122',
      label: 'INV-10122',
      amount: '126.00',
      reference: 'INV-10122',
      dueDate: '2026-04-14',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10123',
      label: 'INV-10123',
      amount: '988.55',
      reference: 'INV-10123',
      dueDate: '2026-05-01',
      hasFlexPayTerms: true,
    },
  ],
  'nova-civil': [
    {
      id: 'inv-10131',
      label: 'INV-10131',
      amount: '12050.00',
      reference: 'INV-10131',
      dueDate: '2026-04-18',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10132',
      label: 'INV-10132',
      amount: '8450.30',
      reference: 'INV-10132',
      dueDate: '2026-05-02',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10133',
      label: 'INV-10133',
      amount: '6422.00',
      reference: 'INV-10133',
      dueDate: '2026-05-20',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10134',
      label: 'INV-10134',
      amount: '990.10',
      reference: 'INV-10134',
      dueDate: '2026-06-03',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10135',
      label: 'INV-10135',
      amount: '2340.70',
      reference: 'INV-10135',
      dueDate: '2026-06-25',
      hasFlexPayTerms: false,
    },
  ],
  'summit-office': [
    {
      id: 'inv-10141',
      label: 'INV-10141',
      amount: '560.80',
      reference: 'INV-10141',
      dueDate: '2026-03-29',
      hasFlexPayTerms: true,
    },
  ],
  'coastal-clean': [
    {
      id: 'inv-10151',
      label: 'INV-10151',
      amount: '1290.00',
      reference: 'INV-10151',
      dueDate: '2026-04-11',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10152',
      label: 'INV-10152',
      amount: '910.45',
      reference: 'INV-10152',
      dueDate: '2026-04-29',
      hasFlexPayTerms: true,
    },
  ],
  'metro-it': [
    {
      id: 'inv-10161',
      label: 'INV-10161',
      amount: '2499.99',
      reference: 'INV-10161',
      dueDate: '2026-03-24',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10162',
      label: 'INV-10162',
      amount: '1780.00',
      reference: 'INV-10162',
      dueDate: '2026-04-08',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10163',
      label: 'INV-10163',
      amount: '320.40',
      reference: 'INV-10163',
      dueDate: '2026-04-27',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10164',
      label: 'INV-10164',
      amount: '715.15',
      reference: 'INV-10164',
      dueDate: '2026-05-16',
      hasFlexPayTerms: false,
    },
  ],
  'cedar-wholesale': [],
  'urban-print': [
    {
      id: 'inv-10181',
      label: 'INV-10181',
      amount: '440.00',
      reference: 'INV-10181',
      dueDate: '2026-04-01',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10182',
      label: 'INV-10182',
      amount: '275.30',
      reference: 'INV-10182',
      dueDate: '2026-04-19',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10183',
      label: 'INV-10183',
      amount: '890.00',
      reference: 'INV-10183',
      dueDate: '2026-05-07',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10184',
      label: 'INV-10184',
      amount: '122.75',
      reference: 'INV-10184',
      dueDate: '2026-05-23',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10185',
      label: 'INV-10185',
      amount: '1345.00',
      reference: 'INV-10185',
      dueDate: '2026-06-12',
      hasFlexPayTerms: true,
    },
  ],
  'prairie-freight': [
    {
      id: 'inv-10191',
      label: 'INV-10191',
      amount: '5010.00',
      reference: 'INV-10191',
      dueDate: '2026-04-10',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10192',
      label: 'INV-10192',
      amount: '2220.50',
      reference: 'INV-10192',
      dueDate: '2026-04-30',
      hasFlexPayTerms: true,
    },
  ],
  'aurora-trade': [
    {
      id: 'inv-10201',
      label: 'INV-10201',
      amount: '188.00',
      reference: 'INV-10201',
      dueDate: '2026-03-27',
      hasFlexPayTerms: false,
    },
  ],
  'golden-grain': [
    {
      id: 'inv-10211',
      label: 'INV-10211',
      amount: '980.35',
      reference: 'INV-10211',
      dueDate: '2026-04-03',
      hasFlexPayTerms: false,
    },
    {
      id: 'inv-10212',
      label: 'INV-10212',
      amount: '1320.00',
      reference: 'INV-10212',
      dueDate: '2026-04-22',
      hasFlexPayTerms: true,
    },
    {
      id: 'inv-10213',
      label: 'INV-10213',
      amount: '655.60',
      reference: 'INV-10213',
      dueDate: '2026-05-13',
      hasFlexPayTerms: false,
    },
  ],
};

function parseAmount(value: string): number {
  const normalized = value.replace(/\$/g, '').replace(/,/g, '').trim();
  return Number.parseFloat(normalized);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAmount(value: string): string {
  const parsed = parseAmount(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatDate(value: Date): string {
  const day = String(value.getDate()).padStart(2, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const year = value.getFullYear();
  return `${day}/${month}/${year}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getMinAllowedOffset(dueDate: Date, baseMinOffset: number): number {
  const today = startOfDay(new Date());
  const due = startOfDay(dueDate);
  const diffMs = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(baseMinOffset, diffDays);
}

export function SupplierSinglePage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const wireUp = useCallback(
    (root: HTMLElement) => {
      const cleanups: Array<() => void> = [];

      ensureGetPaidSidebarItem(root, false);
      cleanups.push(wireLocalAnchors(root, navigate));
      cleanups.push(wireHeaderLogout(root, signOut));

      const payeeInput = root.querySelector<HTMLInputElement>('#mui-17');
      const payeeStack =
        payeeInput?.closest<HTMLElement>('.MuiStack-root.css-4jin6z') ??
        payeeInput?.closest<HTMLElement>('.MuiStack-root');
      const amountInput = root.querySelector<HTMLInputElement>('#mui-19');
      const descriptionInput = root.querySelector<HTMLInputElement>('#mui-20');
      const referenceInput = root.querySelector<HTMLInputElement>('#mui-21');
      const amountField = amountInput?.closest('.MuiInputBase-root');
      const referenceField = referenceInput?.closest('.MuiInputBase-root');
      const referenceLabel = root.querySelector<HTMLLabelElement>('label[for="mui-21"]');
      const footerDateValue = Array.from(root.querySelectorAll<HTMLElement>('h6')).find((heading) => {
        const text = heading.textContent?.trim() ?? '';
        return /^\d{2}\/\d{2}\/\d{4}$/.test(text) && heading.closest('.MuiPaper-outlined');
      });
      const initialFooterDateValue = footerDateValue?.textContent?.trim() ?? '';
      const defaultScheduleLabel = Array.from(root.querySelectorAll<HTMLParagraphElement>('p')).find(
        (paragraph) =>
          paragraph.textContent?.trim() === 'When would you like the payment to be debited?',
      );
      const defaultScheduleSection =
        defaultScheduleLabel?.closest<HTMLElement>('.MuiStack-root.css-18zsr3k') ?? null;

      let payeeSelect = root.querySelector<HTMLSelectElement>('#flexpay-payee-select');
      if (!payeeSelect && payeeStack) {
        payeeStack.classList.add('flexpay-payee-wrapper');
        payeeStack.innerHTML = `
          <label class="MuiFormLabel-root MuiInputLabel-root MuiInputLabel-animated MuiFormLabel-colorPrimary MuiInputLabel-root MuiInputLabel-animated css-d4dubv flexpay-static-label" for="flexpay-payee-select">Payee</label>
          <div class="MuiFormControl-root MuiTextField-root css-1fp8rql">
            <div class="MuiInputBase-root MuiOutlinedInput-root MuiInputBase-colorPrimary MuiInputBase-formControl css-1lyj1ux">
              <select id="flexpay-payee-select" name="payee" class="MuiInputBase-input MuiOutlinedInput-input css-ab0xnz flexpay-invoice-select" data-testid="payee-input">
                <option value="">Select payee</option>
                ${PAYEE_OPTIONS.map((payee) => `<option value="${payee.id}">${payee.name}</option>`).join('')}
              </select>
              <span class="flexpay-select-caret" aria-hidden="true">▾</span>
              <fieldset aria-hidden="true" class="MuiOutlinedInput-notchedOutline css-igs3ac">
                <legend class="css-ihdtdm"><span class="notranslate">​</span></legend>
              </fieldset>
            </div>
          </div>
        `;

        payeeSelect = payeeStack.querySelector<HTMLSelectElement>('#flexpay-payee-select');
      }

      const payeeControl = payeeSelect ?? payeeInput;
      if (payeeControl) {
        payeeControl.name = 'payee';
        payeeControl.dataset.testid = 'payee-input';
      }
      if (amountInput) {
        amountInput.name = 'amount';
        amountInput.dataset.testid = 'amount-input';
      }
      if (descriptionInput) {
        descriptionInput.name = 'description';
      }
      if (referenceInput) {
        referenceInput.name = 'reference';
        referenceInput.dataset.testid = 'reference-input';
      }
      if (footerDateValue) {
        footerDateValue.dataset.testid = 'footer-payment-date';
      }

      if (defaultScheduleSection) {
        defaultScheduleSection.dataset.testid = 'default-schedule-section';
      }

      const setReferenceLabelShrink = () => {
        if (!referenceLabel || !referenceInput) {
          return;
        }

        const shouldShrink = referenceInput.value.trim().length > 0;
        referenceLabel.dataset.shrink = shouldShrink ? 'true' : 'false';
        referenceLabel.classList.toggle('MuiInputLabel-shrink', shouldShrink);
        referenceLabel.classList.toggle('flexpay-label-shrunk', shouldShrink);
      };

      setReferenceLabelShrink();

      if (referenceInput) {
        const referenceInputHandler = () => setReferenceLabelShrink();
        referenceInput.addEventListener('input', referenceInputHandler);
        cleanups.push(() => referenceInput.removeEventListener('input', referenceInputHandler));
      }

      let invoiceWrapper = root.querySelector<HTMLElement>('.flexpay-invoice-wrapper');
      let invoiceSelect = root.querySelector<HTMLSelectElement>('#flexpay-invoice-select');
      if (!invoiceWrapper || !invoiceSelect) {
        const addPayeeButton = findButtonByText(root, 'Add a new payee');
        const addPayeeBlock = addPayeeButton?.closest('.MuiBox-root');

        if (addPayeeBlock) {
          const nextInvoiceWrapper = document.createElement('div');
          nextInvoiceWrapper.className = 'MuiStack-root css-4jin6z flexpay-invoice-wrapper';
          nextInvoiceWrapper.dataset.testid = 'invoice-wrapper';
          nextInvoiceWrapper.hidden = true;
          nextInvoiceWrapper.innerHTML = `
            <label class="MuiFormLabel-root MuiInputLabel-root MuiInputLabel-animated MuiFormLabel-colorPrimary MuiInputLabel-root MuiInputLabel-animated css-d4dubv flexpay-static-label" for="flexpay-invoice-select">Invoice</label>
            <div class="MuiFormControl-root MuiTextField-root css-1fp8rql">
              <div class="MuiInputBase-root MuiOutlinedInput-root MuiInputBase-colorPrimary MuiInputBase-formControl css-1lyj1ux">
                <select id="flexpay-invoice-select" class="MuiInputBase-input MuiOutlinedInput-input css-ab0xnz flexpay-invoice-select" data-testid="invoice-select"></select>
                <span class="flexpay-select-caret" aria-hidden="true">▾</span>
                <fieldset aria-hidden="true" class="MuiOutlinedInput-notchedOutline css-igs3ac">
                  <legend class="css-ihdtdm"><span class="notranslate">​</span></legend>
                </fieldset>
              </div>
            </div>
          `;

          addPayeeBlock.insertAdjacentElement('afterend', nextInvoiceWrapper);
          invoiceWrapper = nextInvoiceWrapper;
          invoiceSelect = nextInvoiceWrapper.querySelector<HTMLSelectElement>('#flexpay-invoice-select');
        }
      }

      if (invoiceWrapper && invoiceSelect && amountInput && referenceInput) {
        let activeInvoiceOptions: InvoiceOption[] = [];

        const setInvoiceOptions = (options: InvoiceOption[]) => {
          activeInvoiceOptions = options;
          invoiceSelect.innerHTML = `
            <option value="">No invoice</option>
            ${options
              .map(
                (invoice) =>
                  `<option value="${invoice.id}">${invoice.label} — $${formatAmount(invoice.amount)}</option>`,
              )
              .join('')}
          `;
        };

        let invoiceScheduleSection = root.querySelector<HTMLElement>('.flexpay-invoice-schedule');
        if (!invoiceScheduleSection && defaultScheduleSection) {
          invoiceScheduleSection = document.createElement('div');
          invoiceScheduleSection.className = 'MuiStack-root css-18zsr3k flexpay-invoice-schedule';
          invoiceScheduleSection.dataset.testid = 'invoice-schedule-section';
          invoiceScheduleSection.innerHTML = `
            <div class="MuiStack-root css-1r5to7m">
              <p class="MuiTypography-root MuiTypography-body1 css-1q3lqmt">When would you like to pay?</p>
            </div>
            <div class="flexpay-slider-wrap">
              <div class="flexpay-slider-top">
                <button type="button" class="flexpay-on-time-detail-label flexpay-chip-btn" data-testid="invoice-on-time-pill">Due date</button>
              </div>
              <input type="range" min="-30" max="30" step="1" value="0" class="flexpay-pay-timing-slider" data-testid="invoice-timing-slider" data-base-min="-30" data-base-max="30" />
              <div class="flexpay-slider-scale">
                <button type="button" class="flexpay-early-detail-label flexpay-chip-btn" data-testid="invoice-early-pill">Pay early for bonus points</button>
                <button type="button" class="flexpay-late-detail-label flexpay-chip-btn" data-testid="invoice-late-pill">Defer payment for a fee</button>
              </div>
              <p class="flexpay-slider-summary" data-testid="invoice-payment-summary"></p>
            </div>
          `;
          defaultScheduleSection.insertAdjacentElement('afterend', invoiceScheduleSection);
        }

        const timingSlider =
          invoiceScheduleSection?.querySelector<HTMLInputElement>('.flexpay-pay-timing-slider') ?? null;
        const sliderWrap =
          invoiceScheduleSection?.querySelector<HTMLElement>('.flexpay-slider-wrap') ?? null;
        const sliderScale =
          invoiceScheduleSection?.querySelector<HTMLElement>('.flexpay-slider-scale') ?? null;
        const sliderSummary =
          invoiceScheduleSection?.querySelector<HTMLElement>('.flexpay-slider-summary') ?? null;
        const onTimePill =
          invoiceScheduleSection?.querySelector<HTMLButtonElement>('[data-testid="invoice-on-time-pill"]') ??
          null;
        const earlyPill =
          invoiceScheduleSection?.querySelector<HTMLButtonElement>('[data-testid="invoice-early-pill"]') ??
          null;
        const latePill =
          invoiceScheduleSection?.querySelector<HTMLButtonElement>('[data-testid="invoice-late-pill"]') ??
          null;

        const updateInvoiceSchedule = (selectedInvoice: InvoiceOption | undefined) => {
          if (!invoiceScheduleSection || !defaultScheduleSection) {
            return;
          }

          if (!selectedInvoice || !selectedInvoice.hasFlexPayTerms || !timingSlider || !sliderSummary) {
            invoiceScheduleSection.style.display = 'none';
            defaultScheduleSection.style.display = '';
            if (footerDateValue && initialFooterDateValue) {
              footerDateValue.textContent = initialFooterDateValue;
            }
            return;
          }

          defaultScheduleSection.style.display = 'none';
          invoiceScheduleSection.style.display = '';

          const dueDate = new Date(`${selectedInvoice.dueDate}T00:00:00`);
          const baseMin = Number(timingSlider.dataset.baseMin ?? timingSlider.min);
          const baseMax = Number(timingSlider.dataset.baseMax ?? timingSlider.max);
          const minAllowedOffset = getMinAllowedOffset(dueDate, baseMin);
          const maxAllowedOffset = Math.max(baseMax, minAllowedOffset);
          timingSlider.min = String(minAllowedOffset);
          timingSlider.max = String(maxAllowedOffset);
          const range = maxAllowedOffset - minAllowedOffset;
          const duePosition =
            range <= 0 ? 0 : ((0 - minAllowedOffset) / range) * 100;
          const clampedDuePosition = Math.max(0, Math.min(100, duePosition));
          sliderWrap?.style.setProperty('--flexpay-due-position', `${clampedDuePosition}%`);
          sliderScale?.style.setProperty('--flexpay-due-position', `${clampedDuePosition}%`);

          let offset = Number(timingSlider.value);
          if (!Number.isFinite(offset)) {
            offset = 0;
          }
          offset = Math.max(minAllowedOffset, Math.min(maxAllowedOffset, offset));
          timingSlider.value = String(offset);

          const paymentDate = addDays(dueDate, offset);
          const paymentAmount = parseAmount(amountInput.value);
          if (footerDateValue) {
            footerDateValue.textContent = formatDate(paymentDate);
          }
          const sliderMin = Number(timingSlider.min);
          const sliderMax = Number(timingSlider.max);
          const progress = ((offset - sliderMin) / (sliderMax - sliderMin)) * 100;

          let sliderColor = '#1f73e8';
          if (offset <= -7) {
            sliderColor = '#1f9d55';
            const currentValue = (0.02 * paymentAmount) / 0.0075;
            const points = Math.round((1 - PAYREWARDS_MARGIN) * currentValue);
            sliderSummary.innerHTML = `Payment date: ${formatDate(paymentDate)}. Paying ${Math.abs(offset)} days early will earn <strong>${points.toLocaleString('en-US')} bonus PayRewards Points</strong>.`;
          } else if (offset > 0) {
            sliderColor = '#d14343';
            const lateFee = 0.02 * paymentAmount;
            const dayLabel = offset === 1 ? 'day' : 'days';
            sliderSummary.innerHTML = `Payment date: ${formatDate(paymentDate)}. Pay ${offset} ${dayLabel} late for a fee of ${formatCurrency(lateFee)}.`;
          } else {
            sliderSummary.innerHTML = `Payment date: ${formatDate(paymentDate)}.`;
          }

          timingSlider.style.background = `linear-gradient(to right, ${sliderColor} 0%, ${sliderColor} ${progress}%, #d5dbe4 ${progress}%, #d5dbe4 100%)`;
          timingSlider.style.setProperty('--flexpay-slider-thumb-color', sliderColor);
        };

        const toggleInvoiceLockState = (isLocked: boolean) => {
          amountInput.disabled = isLocked;
          referenceInput.disabled = isLocked;

          amountInput.setAttribute('aria-disabled', String(isLocked));
          referenceInput.setAttribute('aria-disabled', String(isLocked));

          amountField?.classList.toggle('Mui-disabled', isLocked);
          referenceField?.classList.toggle('Mui-disabled', isLocked);
          amountField?.classList.toggle('flexpay-locked-field', isLocked);
          referenceField?.classList.toggle('flexpay-locked-field', isLocked);
          referenceLabel?.classList.toggle('flexpay-reference-label-selected', isLocked);
        };

        toggleInvoiceLockState(false);
        updateInvoiceSchedule(undefined);

        const invoiceChangeHandler = () => {
          const selectedInvoice = activeInvoiceOptions.find((invoice) => invoice.id === invoiceSelect?.value);

          if (!selectedInvoice) {
            toggleInvoiceLockState(false);
            setReferenceLabelShrink();
            if (timingSlider) {
              timingSlider.value = '0';
            }
            updateInvoiceSchedule(undefined);
            return;
          }

          amountInput.value = formatAmount(selectedInvoice.amount);
          referenceInput.value = selectedInvoice.reference;
          setReferenceLabelShrink();
          toggleInvoiceLockState(true);
          if (timingSlider) {
            timingSlider.value = '0';
          }
          updateInvoiceSchedule(selectedInvoice);
        };

        const sliderInputHandler = () => {
          const selectedInvoice = activeInvoiceOptions.find((invoice) => invoice.id === invoiceSelect?.value);
          updateInvoiceSchedule(selectedInvoice);
        };

        const onTimePillHandler = () => {
          const selectedInvoice = activeInvoiceOptions.find((invoice) => invoice.id === invoiceSelect?.value);
          if (!selectedInvoice || !timingSlider) {
            return;
          }
          timingSlider.value = '0';
          updateInvoiceSchedule(selectedInvoice);
        };

        const earlyPillHandler = () => {
          const selectedInvoice = activeInvoiceOptions.find((invoice) => invoice.id === invoiceSelect?.value);
          if (!selectedInvoice || !timingSlider) {
            return;
          }
          timingSlider.value = timingSlider.min;
          updateInvoiceSchedule(selectedInvoice);
        };

        const latePillHandler = () => {
          const selectedInvoice = activeInvoiceOptions.find((invoice) => invoice.id === invoiceSelect?.value);
          if (!selectedInvoice || !timingSlider) {
            return;
          }
          timingSlider.value = timingSlider.max;
          updateInvoiceSchedule(selectedInvoice);
        };

        const payeeChangeHandler = () => {
          const selectedPayeeId = payeeSelect?.value ?? '';
          const payeeInvoices = selectedPayeeId ? INVOICES_BY_PAYEE[selectedPayeeId] ?? [] : [];
          const showInvoiceField = payeeInvoices.length > 0;

          setInvoiceOptions(payeeInvoices);
          invoiceWrapper.hidden = !showInvoiceField;
          invoiceSelect.value = '';
          toggleInvoiceLockState(false);
          setReferenceLabelShrink();
          if (payeeSelect) {
            payeeSelect.setAttribute('aria-invalid', selectedPayeeId ? 'false' : 'true');
          }
          if (timingSlider) {
            timingSlider.value = '0';
          }
          updateInvoiceSchedule(undefined);
        };

        invoiceSelect.addEventListener('change', invoiceChangeHandler);
        payeeSelect?.addEventListener('change', payeeChangeHandler);
        timingSlider?.addEventListener('input', sliderInputHandler);
        onTimePill?.addEventListener('click', onTimePillHandler);
        earlyPill?.addEventListener('click', earlyPillHandler);
        latePill?.addEventListener('click', latePillHandler);
        cleanups.push(() => invoiceSelect?.removeEventListener('change', invoiceChangeHandler));
        cleanups.push(() => payeeSelect?.removeEventListener('change', payeeChangeHandler));
        cleanups.push(() => timingSlider?.removeEventListener('input', sliderInputHandler));
        cleanups.push(() => onTimePill?.removeEventListener('click', onTimePillHandler));
        cleanups.push(() => earlyPill?.removeEventListener('click', earlyPillHandler));
        cleanups.push(() => latePill?.removeEventListener('click', latePillHandler));

        payeeChangeHandler();
      }

      const continueButton = findButtonByText(root, 'Continue');
      const cancelButton = findButtonByText(root, 'Cancel');
      const form = root.querySelector<HTMLFormElement>('#payment-details');

      if (cancelButton) {
        cancelButton.dataset.testid = 'cancel-button';
        const cancelHandler = (event: Event) => {
          event.preventDefault();
          navigate('/select-type');
        };
        cancelButton.addEventListener('click', cancelHandler);
        cleanups.push(() => cancelButton.removeEventListener('click', cancelHandler));
      }

      const errorBox = document.createElement('div');
      errorBox.className = 'flexpay-error-box';
      errorBox.dataset.testid = 'form-errors';

      if (form) {
        form.appendChild(errorBox);
        const submitHandler = (event: Event) => {
          event.preventDefault();
        };
        form.addEventListener('submit', submitHandler);
        cleanups.push(() => form.removeEventListener('submit', submitHandler));
      }

      if (continueButton && payeeControl && amountInput) {
        continueButton.dataset.testid = 'continue-button';

        const continueHandler = (event: Event) => {
          event.preventDefault();

          const scheduleInput = root.querySelector<HTMLInputElement>(
            'input[name="When would you like to pay?"]:checked',
          );

          const normalizedForm: NormalizedPaymentForm = {
            payee: payeeControl.value.trim(),
            amount: amountInput.value.trim(),
            description: descriptionInput?.value.trim() ?? '',
            reference: referenceInput?.value.trim() ?? '',
            schedule: scheduleInput?.value ?? '',
          };

          const errors: string[] = [];

          if (!normalizedForm.payee) {
            errors.push('Payee is required.');
            payeeControl.setAttribute('aria-invalid', 'true');
          } else {
            payeeControl.setAttribute('aria-invalid', 'false');
          }

          const parsedAmount = parseAmount(normalizedForm.amount);
          if (!normalizedForm.amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
            errors.push('Amount must be greater than 0.');
            amountInput.setAttribute('aria-invalid', 'true');
          } else {
            amountInput.setAttribute('aria-invalid', 'false');
          }

          if (!normalizedForm.schedule) {
            errors.push('Payment schedule is required.');
          }

          if (errors.length > 0) {
            errorBox.innerHTML = errors.map((error) => `<p>${error}</p>`).join('');
            return;
          }

          errorBox.innerHTML = '';
          navigate('/new-payment', { state: { submitted: true } });
        };

        continueButton.addEventListener('click', continueHandler);
        cleanups.push(() => continueButton.removeEventListener('click', continueHandler));
      }

      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    },
    [navigate, signOut],
  );

  return (
    <ReferencePage
      sourceHtml={referenceAssets.supplierSingleHtml}
      wireUp={wireUp}
      styleId="supplier-single"
    />
  );
}
