import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ReferencePage } from '../components/ReferencePage';
import {
  ensureGetPaidSidebarItem,
  findCardByText,
  makeInteractiveCard,
  wireLocalAnchors,
} from '../lib/domHelpers';
import { referenceAssets } from '../lib/referenceAssets';

export function NewPaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const wireUp = useCallback(
    (root: HTMLElement) => {
      const cleanups: Array<() => void> = [];

      ensureGetPaidSidebarItem(root, false);
      cleanups.push(wireLocalAnchors(root, navigate));

      const supplierCard = findCardByText(root, 'Supplier payment');
      if (supplierCard) {
        cleanups.push(
          makeInteractiveCard(supplierCard, () => {
            navigate('/select-type');
          }, 'supplier-payment-card'),
        );
      }

      if (location.state && typeof location.state === 'object' && 'submitted' in location.state) {
        const title = root.querySelector('h3');
        const existingBanner = root.querySelector('.flexpay-inline-banner');
        if (title && !existingBanner) {
          const banner = document.createElement('p');
          banner.className = 'flexpay-inline-banner';
          banner.textContent = 'Payment details captured successfully.';
          title.insertAdjacentElement('afterend', banner);
        }
      }

      return () => {
        for (const cleanup of cleanups) {
          cleanup();
        }
      };
    },
    [location.state, navigate],
  );

  return (
    <ReferencePage
      sourceHtml={referenceAssets.newPaymentHtml}
      wireUp={wireUp}
      styleId="new-payment"
    />
  );
}
