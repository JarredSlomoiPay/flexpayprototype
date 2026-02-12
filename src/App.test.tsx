import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from './auth/AuthContext';
import { AppRoutes } from './App';
import * as invoiceOcr from './lib/invoiceOcr';

function renderApp(initialEntries: string[]) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('payment flow', () => {
  it('navigates from payment type to select type to supplier single', async () => {
    const user = userEvent.setup();

    renderApp(['/new-payment']);
    expect(await screen.findByTestId('prototype-banner')).toHaveTextContent('Flex Pay Prototype');

    const supplierCard = await screen.findByTestId('supplier-payment-card');
    await user.click(supplierCard);

    await screen.findByText('How would you like to enter payee information?');

    const manualCard = await screen.findByTestId('enter-manually-card');
    await user.click(manualCard);

    await screen.findByTestId('continue-button');
  });

  it('logs out from the header account menu', async () => {
    const user = userEvent.setup();

    renderApp(['/new-payment']);

    const profileButton = await screen.findByTestId('header-profile-button');
    await user.click(profileButton);

    const logoutAction = await screen.findByTestId('logout-action');
    await user.click(logoutAction);

    await screen.findByRole('heading', { name: 'Sign in' });
  });

  it('validates required fields on supplier single before continue', async () => {
    const user = userEvent.setup();

    renderApp(['/supplier-single']);

    const continueButton = await screen.findByTestId('continue-button');
    await user.click(continueButton);

    const errors = await screen.findByTestId('form-errors');
    expect(errors).toHaveTextContent('Payee is required.');
    expect(errors).toHaveTextContent('Amount must be greater than 0.');

    await user.selectOptions(screen.getByTestId('payee-input'), 'acme-supplies');
    await user.type(screen.getByTestId('amount-input'), '125.50');
    await user.click(continueButton);

    await waitFor(() => {
      expect(screen.queryByText('Payee is required.')).not.toBeInTheDocument();
    });

    await screen.findByText('What type of payment would you like to make?');
  });

  it('prepopulates and locks amount/reference when an invoice is selected', async () => {
    const user = userEvent.setup();

    renderApp(['/supplier-single']);

    const payeeSelect = await screen.findByTestId('payee-input');
    const invoiceWrapper = await screen.findByTestId('invoice-wrapper');
    const amountInput = await screen.findByTestId('amount-input');
    const referenceInput = await screen.findByTestId('reference-input');
    const footerDate = await screen.findByTestId('footer-payment-date');
    const referenceLabel = screen.getByText('Reference e.g. invoice number', { selector: 'label' });
    const defaultScheduleSection = await screen.findByTestId('default-schedule-section');
    const invoiceScheduleSection = await screen.findByTestId('invoice-schedule-section');
    const addPayeeButton = await screen.findByRole('button', { name: /add a new payee/i });
    const caret = document.querySelector('.flexpay-select-caret');

    expect(invoiceWrapper).not.toBeVisible();
    expect(amountInput).not.toBeDisabled();
    expect(referenceInput).not.toBeDisabled();
    expect(defaultScheduleSection).not.toHaveStyle({ display: 'none' });
    expect(invoiceScheduleSection).toHaveStyle({ display: 'none' });
    expect(caret).toBeInTheDocument();

    await user.selectOptions(payeeSelect, 'atlas-logistics');
    expect(invoiceWrapper).not.toBeVisible();

    await user.selectOptions(payeeSelect, 'acme-supplies');
    expect(invoiceWrapper).toBeVisible();

    const invoiceSelect = await screen.findByTestId('invoice-select');
    expect(addPayeeButton.compareDocumentPosition(invoiceSelect) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.selectOptions(invoiceSelect, 'inv-10087');

    expect(amountInput).toHaveValue('1,890.00');
    expect(referenceInput).toHaveValue('INV-10087');
    expect(footerDate).toHaveTextContent('11/03/2026');
    expect(referenceLabel).toHaveClass('flexpay-label-shrunk');
    expect(referenceLabel).toHaveClass('flexpay-reference-label-selected');
    expect(amountInput).toBeDisabled();
    expect(referenceInput).toBeDisabled();
    expect(defaultScheduleSection).toHaveStyle({ display: 'none' });
    expect(invoiceScheduleSection).not.toHaveStyle({ display: 'none' });
    expect(screen.getByText('Pay early for bonus points')).toBeInTheDocument();
    expect(screen.getByText('Defer payment for a fee')).toBeInTheDocument();

    const timingSlider = await screen.findByTestId('invoice-timing-slider');
    const onTimePill = await screen.findByTestId('invoice-on-time-pill');
    const earlyPill = await screen.findByTestId('invoice-early-pill');
    const latePill = await screen.findByTestId('invoice-late-pill');
    const summary = await screen.findByTestId('invoice-payment-summary');
    const slider = timingSlider as HTMLInputElement;
    const dueDate = new Date('2026-03-11T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayMs = 24 * 60 * 60 * 1000;
    const expectedMin = Math.max(-30, Math.ceil((today.getTime() - dueDate.getTime()) / dayMs));
    const expectedDefaultOffset = Math.max(0, expectedMin);
    const dateLabel = (date: Date) =>
      `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    const expectedDefaultDate = new Date(dueDate);
    expectedDefaultDate.setDate(expectedDefaultDate.getDate() + expectedDefaultOffset);

    expect(Number(slider.min)).toBe(expectedMin);
    expect(Number(slider.value)).toBe(expectedDefaultOffset);
    expect(summary).toHaveTextContent(`Payment date: ${dateLabel(expectedDefaultDate)}`);
    expect(footerDate).toHaveTextContent(dateLabel(expectedDefaultDate));
    expect(summary).not.toHaveTextContent('incur no additional fee');
    expect(slider.style.background).toContain('#1f73e8');
    expect(slider.style.background).toContain('#d5dbe4');

    fireEvent.input(timingSlider, { target: { value: '-30' } });
    expect(Number(slider.value)).toBe(expectedMin);
    const expectedMinDate = new Date(dueDate);
    expectedMinDate.setDate(expectedMinDate.getDate() + expectedMin);
    expect(summary).toHaveTextContent(`Payment date: ${dateLabel(expectedMinDate)}`);
    expect(footerDate).toHaveTextContent(dateLabel(expectedMinDate));

    const neutralOffset = Math.max(-5, expectedMin);
    fireEvent.input(timingSlider, { target: { value: String(neutralOffset) } });
    const neutralDate = new Date(dueDate);
    neutralDate.setDate(neutralDate.getDate() + neutralOffset);
    expect(summary).toHaveTextContent(`Payment date: ${dateLabel(neutralDate)}`);
    expect(footerDate).toHaveTextContent(dateLabel(neutralDate));
    expect(summary).not.toHaveTextContent('Paying');
    expect(summary).not.toHaveTextContent('bonus PayRewards Points');
    expect(summary.querySelector('strong')).toBeNull();
    expect(slider.style.background).toContain('#1f73e8');
    expect(slider.style.background).toContain('#d5dbe4');

    if (expectedMin <= -7) {
      fireEvent.input(timingSlider, { target: { value: '-7' } });
      expect(summary).toHaveTextContent('Payment date: 04/03/2026');
      expect(footerDate).toHaveTextContent('04/03/2026');
      expect(summary).toHaveTextContent('Paying 7 days early');
      expect(summary).toHaveTextContent('3,780 bonus PayRewards Points');
      expect(summary.querySelector('strong')).toHaveTextContent('3,780 bonus PayRewards Points');
      expect(slider.style.background).toContain('#1f9d55');
      expect(slider.style.background).toContain('#d5dbe4');
    }

    fireEvent.input(timingSlider, { target: { value: '7' } });
    expect(summary).toHaveTextContent('Payment date: 18/03/2026');
    expect(footerDate).toHaveTextContent('18/03/2026');
    expect(summary).toHaveTextContent('Pay 7 days late for a fee of');
    expect(summary).toHaveTextContent('$37.80');
    expect(slider.style.background).toContain('#d14343');
    expect(slider.style.background).toContain('#d5dbe4');

    await user.click(earlyPill);
    expect(Number(slider.value)).toBe(expectedMin);
    expect(summary).toHaveTextContent(`Payment date: ${dateLabel(expectedMinDate)}`);
    expect(footerDate).toHaveTextContent(dateLabel(expectedMinDate));

    await user.click(latePill);
    expect(Number(slider.value)).toBe(Number(slider.max));
    const expectedMaxDate = new Date(dueDate);
    expectedMaxDate.setDate(expectedMaxDate.getDate() + Number(slider.max));
    expect(summary).toHaveTextContent(`Payment date: ${dateLabel(expectedMaxDate)}`);
    expect(footerDate).toHaveTextContent(dateLabel(expectedMaxDate));

    await user.click(onTimePill);
    expect(Number(slider.value)).toBe(expectedDefaultOffset);
    expect(summary).toHaveTextContent(`Payment date: ${dateLabel(expectedDefaultDate)}`);
    expect(footerDate).toHaveTextContent(dateLabel(expectedDefaultDate));

    await user.selectOptions(invoiceSelect, 'inv-10104');
    expect(amountInput).toHaveValue('59.90');
    expect(referenceInput).toHaveValue('INV-10104');
    expect(amountInput).toBeDisabled();
    expect(referenceInput).toBeDisabled();
    expect(defaultScheduleSection).not.toHaveStyle({ display: 'none' });
    expect(invoiceScheduleSection).toHaveStyle({ display: 'none' });

    await user.selectOptions(invoiceSelect, '');

    expect(amountInput).toHaveValue('59.90');
    expect(referenceInput).toHaveValue('INV-10104');
    expect(amountInput).not.toBeDisabled();
    expect(referenceInput).not.toBeDisabled();
    expect(footerDate).toHaveTextContent('11/02/2026');
    expect(referenceLabel).not.toHaveClass('flexpay-reference-label-selected');
    expect(defaultScheduleSection).not.toHaveStyle({ display: 'none' });
    expect(invoiceScheduleSection).toHaveStyle({ display: 'none' });
  });

  it('navigates to get paid from the sidebar', async () => {
    const user = userEvent.setup();

    renderApp(['/new-payment']);

    const getPaidParent = await screen.findByTestId('get-paid-menu-parent');
    await user.click(getPaidParent);
    const invoicesLink = await screen.findByTestId('get-paid-invoices-link');
    await user.click(invoicesLink);

    await screen.findByRole('heading', { name: 'Invoices' });
    expect(screen.getByTestId('add-invoice-button')).toBeInTheDocument();
  });

  it('adds a new invoice with optional flexpay terms on get paid page', async () => {
    const user = userEvent.setup();

    renderApp(['/get-paid']);

    const addInvoiceButton = await screen.findByTestId('add-invoice-button');
    await user.click(addInvoiceButton);
    expect(screen.getByTestId('invoice-table')).not.toBeVisible();

    const saveButton = await screen.findByTestId('save-invoice-button');
    await user.type(screen.getByLabelText('Invoice number'), 'INV-88888');
    await user.type(screen.getByLabelText('Customer name'), 'Future Goods Pty Ltd');
    await user.type(screen.getByLabelText('Customer ABN'), '11 222 333 444');
    fireEvent.change(screen.getByLabelText('Issue date'), { target: { value: '2026-02-15' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-03-17' } });
    await user.type(screen.getByLabelText('Invoice amount'), '2500.75');
    expect(screen.getByLabelText('Invoice amount')).toHaveValue('2,500.75');
    await user.selectOptions(screen.getByLabelText('Invoice status'), 'Draft');

    await user.click(screen.getByTestId('add-early-term'));
    const daysEarlyInput = screen.getByLabelText(/^Days early/);
    const bonusRateInput = screen.getByLabelText('Bonus rate (%)');
    await user.type(daysEarlyInput, '10');
    await user.type(bonusRateInput, '1.5');
    expect(screen.getByText('Days early (payment before 07/03/2026)')).toBeInTheDocument();

    const earlyRow = daysEarlyInput.closest('.flexpay-term-row');
    expect(earlyRow).not.toBeNull();
    expect(within(earlyRow as HTMLElement).getByText('3,751')).toBeInTheDocument();
    expect(within(earlyRow as HTMLElement).getByText('$37.51')).toBeInTheDocument();

    await user.click(screen.getByTestId('add-late-term'));
    const daysLateInput = screen.getByLabelText(/^Days late/);
    const feeRateInput = screen.getByLabelText('Fee rate (%)');
    await user.type(daysLateInput, '20');
    await user.type(feeRateInput, '4');
    expect(screen.getByText('Days late (payment after 06/04/2026)')).toBeInTheDocument();

    const lateRow = daysLateInput.closest('.flexpay-term-row');
    expect(lateRow).not.toBeNull();
    expect(within(lateRow as HTMLElement).getByText('$100.03')).toBeInTheDocument();
    expect(within(lateRow as HTMLElement).getByText('10,003')).toBeInTheDocument();

    await user.click(saveButton);

    await screen.findByText('INV-88888');
    const newInvoiceRow = screen.getByText('INV-88888').closest('tr');
    expect(newInvoiceRow).not.toBeNull();
    expect(screen.getByText('Future Goods Pty Ltd')).toBeInTheDocument();
    expect(screen.getByText('$2,500.75')).toBeInTheDocument();
    expect(within(newInvoiceRow as HTMLTableRowElement).getByText('Draft')).toBeInTheDocument();
    expect(within(newInvoiceRow as HTMLTableRowElement).getByLabelText('FlexPay enabled')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-table')).toBeVisible();
  });

  it('prefills invoice form fields from OCR upload and leaves low-confidence fields blank', async () => {
    const user = userEvent.setup();
    const extractSpy = vi
      .spyOn(invoiceOcr, 'extractInvoiceFieldsFromFile')
      .mockResolvedValue({
        invoiceNumber: { value: 'INV-54321', confidence: 96 },
        customerName: { value: 'Demo Customer Pty Ltd', confidence: 91 },
        customerAbn: { value: '55 444 333 222', confidence: 88 },
        issueDate: { value: '2026-02-21', confidence: 83 },
        dueDate: { value: '2026-03-23', confidence: 78 },
        invoiceAmount: { value: '1750.50', confidence: 92 },
        invoiceStatus: { value: 'Sent', confidence: 40 },
      });
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLMock = vi.fn(() => 'blob:invoice-preview');
    const revokeObjectURLMock = vi.fn();

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });

    try {
      renderApp(['/get-paid']);

      const addInvoiceButton = await screen.findByTestId('add-invoice-button');
      await user.click(addInvoiceButton);

      const fileInput = await screen.findByTestId('invoice-file-input');
      const sampleFile = new File(['fake image bytes'], 'invoice.jpg', { type: 'image/jpeg' });
      await user.upload(fileInput as HTMLInputElement, sampleFile);

      await waitFor(() => {
        expect(extractSpy).toHaveBeenCalledTimes(1);
      });

      expect(createObjectURLMock).toHaveBeenCalledWith(sampleFile);
      expect(screen.getByTestId('invoice-preview')).toBeVisible();
      expect(screen.getByTestId('invoice-preview-image')).toHaveAttribute('src', 'blob:invoice-preview');
      expect(screen.getByTestId('invoice-preview-pdf')).toHaveAttribute('hidden');
      expect(screen.getByLabelText('Invoice number')).toHaveValue('INV-54321');
      expect(screen.getByLabelText('Customer name')).toHaveValue('Demo Customer Pty Ltd');
      expect(screen.getByLabelText('Customer ABN')).toHaveValue('55 444 333 222');
      expect(screen.getByLabelText('Issue date')).toHaveValue('2026-02-21');
      expect(screen.getByLabelText('Invoice amount')).toHaveValue('1,750.50');
      expect(screen.getByLabelText('Due date')).toHaveValue('');
      expect(screen.getByLabelText('Invoice status')).toHaveValue('');

      await user.type(screen.getByLabelText('Customer name'), ' Updated');
      expect(screen.getByLabelText('Customer name')).toHaveValue('Demo Customer Pty Ltd Updated');

      expect(screen.getByTestId('invoice-ocr-status')).toHaveTextContent('OCR complete.');
    } finally {
      extractSpy.mockRestore();
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: originalRevokeObjectURL,
      });
    }
  });
});
