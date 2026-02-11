import type { NavigateFunction } from 'react-router-dom';

export type CleanupFn = () => void;

export function findCardByText(root: HTMLElement, text: string): HTMLElement | null {
  const all = Array.from(root.querySelectorAll<HTMLElement>('*'));
  const node = all.find((el) => el.textContent?.trim() === text);
  return node?.closest<HTMLElement>('.MuiPaper-root') ?? null;
}

export function findButtonByText(root: HTMLElement, text: string): HTMLButtonElement | null {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent?.replace(/\s+/g, ' ').trim() === text,
  ) ?? null;
}

export function makeInteractiveCard(
  card: HTMLElement,
  onActivate: () => void,
  testId?: string,
): CleanupFn {
  const clickHandler = () => onActivate();
  const keyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
  };

  if (testId) {
    card.dataset.testid = testId;
  }

  card.dataset.flexpayInteractive = 'true';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');

  card.addEventListener('click', clickHandler);
  card.addEventListener('keydown', keyHandler);

  return () => {
    card.removeEventListener('click', clickHandler);
    card.removeEventListener('keydown', keyHandler);
  };
}

export function wireLocalAnchors(root: HTMLElement, navigate: NavigateFunction): CleanupFn {
  const handlers: Array<{ anchor: HTMLAnchorElement; fn: (event: Event) => void }> = [];

  const localPathMap: Record<string, string> = {
    '/account/new-payment': '/new-payment',
    '/account/new-payment/select-type': '/select-type',
    '/account/new-payment/supplier/single': '/supplier-single',
    '/account/get-paid': '/get-paid',
  };

  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.getAttribute('href') ?? '';

    if (href.startsWith('http')) {
      continue;
    }

    const mapped = localPathMap[href];
    const handler = (event: Event) => {
      event.preventDefault();
      if (mapped) {
        navigate(mapped);
      }
    };

    anchor.addEventListener('click', handler);
    handlers.push({ anchor, fn: handler });
  }

  return () => {
    for (const { anchor, fn } of handlers) {
      anchor.removeEventListener('click', fn);
    }
  };
}

function getSidebarLinkLabel(link: HTMLAnchorElement): string {
  const text = link.querySelector('.MuiListItemText-root p')?.textContent ?? link.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}

export function ensureGetPaidSidebarItem(root: HTMLElement, isActive: boolean): void {
  const sidebarList = root.querySelector<HTMLUListElement>('ul.MuiList-root');
  if (!sidebarList) {
    return;
  }

  const links = Array.from(sidebarList.querySelectorAll<HTMLAnchorElement>('a[href]'));
  const makePaymentLink =
    links.find((link) => getSidebarLinkLabel(link) === 'Make a payment') ?? null;

  let group = sidebarList.querySelector<HTMLElement>('[data-flexpay-get-paid-group="true"]');
  const paymentsLink = links.find((link) => getSidebarLinkLabel(link) === 'Payments') ?? null;

  if (!group && makePaymentLink) {
    const parentTemplate = (paymentsLink ?? makePaymentLink).cloneNode(true) as HTMLAnchorElement;
    const childTemplate = makePaymentLink.cloneNode(true) as HTMLAnchorElement;

    parentTemplate.dataset.flexpayGetPaidParent = 'true';
    parentTemplate.dataset.testid = 'get-paid-menu-parent';
    parentTemplate.href = '#';
    parentTemplate.classList.add('flexpay-sidebar-parent');
    parentTemplate.classList.remove('Mui-selected');
    parentTemplate.removeAttribute('aria-current');
    parentTemplate.setAttribute('role', 'button');
    parentTemplate.setAttribute('aria-expanded', 'false');

    const parentLabel = parentTemplate.querySelector('.MuiListItemText-root p');
    if (parentLabel) {
      parentLabel.textContent = 'Get paid';
    }

    const parentIconNode = parentTemplate.querySelector('.MuiListItemIcon-root');
    if (parentIconNode) {
      parentIconNode.innerHTML = `
        <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-fwkm60" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="AttachMoneyRoundedIcon" xmlns="http://www.w3.org/2000/svg">
          <path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1.03.44.39.8.83.8h.35c.49 0 .87-.42.84-.91-.08-1.8-1.26-3.44-3.52-3.99V3.8c0-.44-.36-.8-.8-.8h-.4c-.44 0-.8.36-.8.8v1.08c-2.08.45-3.75 1.8-3.75 3.9 0 2.52 2.08 3.78 5.12 4.51 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1-.04-.43-.4-.77-.83-.77h-.34c-.5 0-.89.44-.85.93.12 2.04 1.76 3.19 4 3.63v1.06c0 .44.36.8.8.8h.4c.44 0 .8-.36.8-.8v-1.05c2.09-.4 3.75-1.62 3.75-3.9 0-3.1-2.63-4.14-5.12-4.81"></path>
        </svg>
      `;
    }

    let chevron = parentTemplate.querySelector('svg[data-testid="ExpandMoreIcon"]');
    if (!chevron) {
      chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chevron.setAttribute('class', 'MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-1jbzg03');
      chevron.setAttribute('focusable', 'false');
      chevron.setAttribute('aria-hidden', 'true');
      chevron.setAttribute('viewBox', '0 0 24 24');
      chevron.setAttribute('data-testid', 'ExpandMoreIcon');
      chevron.innerHTML = '<path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"></path>';
      parentTemplate.appendChild(chevron);
    }
    chevron.classList.add('flexpay-sidebar-chevron');

    childTemplate.dataset.flexpayGetPaid = 'true';
    childTemplate.dataset.testid = 'get-paid-invoices-link';
    childTemplate.href = '/account/get-paid';
    childTemplate.classList.remove('Mui-selected');
    childTemplate.removeAttribute('aria-current');
    childTemplate.classList.add('flexpay-sidebar-child');

    const childLabel = childTemplate.querySelector('.MuiListItemText-root p');
    if (childLabel) {
      childLabel.textContent = 'Invoices';
    }

    const childIconNode = childTemplate.querySelector('.MuiListItemIcon-root');
    if (childIconNode) {
      childIconNode.innerHTML = `
        <svg class="MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-fwkm60" focusable="false" aria-hidden="true" viewBox="0 0 24 24" data-testid="ReceiptLongOutlinedIcon" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 2H8c-1.1 0-2 .9-2 2v3H5c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2v-1h1c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m-3 18H5V9h11zm3-3h-1V9c0-1.1-.9-2-2-2H8V4h11zM7 11h7v2H7zm0 3h7v2H7z"></path>
        </svg>
      `;
    }

    const childChevron = childTemplate.querySelector('svg[data-testid="ExpandMoreIcon"]');
    childChevron?.remove();

    group = document.createElement('div');
    group.dataset.flexpayGetPaidGroup = 'true';
    group.className = 'flexpay-sidebar-group flexpay-collapsed';
    group.append(parentTemplate, childTemplate);

    makePaymentLink.insertAdjacentElement('afterend', group);
  }

  if (!group) {
    return;
  }

  const parentLink =
    group.querySelector<HTMLAnchorElement>('a[data-flexpay-get-paid-parent="true"]') ?? null;
  const invoicesLink = group.querySelector<HTMLAnchorElement>('a[data-flexpay-get-paid="true"]') ?? null;

  const setExpanded = (expanded: boolean) => {
    group?.classList.toggle('flexpay-expanded', expanded);
    group?.classList.toggle('flexpay-collapsed', !expanded);
    parentLink?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    if (invoicesLink) {
      invoicesLink.hidden = !expanded;
    }
  };

  if (parentLink && group.dataset.flexpayDropdownWired !== 'true') {
    const parentHandler = (event: Event) => {
      event.preventDefault();
      const shouldExpand = group?.classList.contains('flexpay-collapsed') ?? true;
      setExpanded(shouldExpand);
    };
    parentLink.addEventListener('click', parentHandler);
    group.dataset.flexpayDropdownWired = 'true';
  }

  setExpanded(isActive);

  if (isActive) {
    for (const link of sidebarList.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      link.classList.remove('Mui-selected');
      link.removeAttribute('aria-current');
    }
    parentLink?.classList.add('Mui-selected');
    parentLink?.setAttribute('aria-current', 'page');
    invoicesLink?.classList.add('Mui-selected');
    invoicesLink?.setAttribute('aria-current', 'page');
  } else {
    parentLink?.classList.remove('Mui-selected');
    parentLink?.removeAttribute('aria-current');
    invoicesLink?.classList.remove('Mui-selected');
    invoicesLink?.removeAttribute('aria-current');
  }
}
