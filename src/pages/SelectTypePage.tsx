import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ReferencePage } from '../components/ReferencePage';
import {
  ensureGetPaidSidebarItem,
  findCardByText,
  makeInteractiveCard,
  wireHeaderLogout,
  wireLocalAnchors,
} from '../lib/domHelpers';
import { referenceAssets } from '../lib/referenceAssets';

export function SelectTypePage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const wireUp = useCallback(
    (root: HTMLElement) => {
      const cleanups: Array<() => void> = [];

      ensureGetPaidSidebarItem(root, false);
      cleanups.push(wireLocalAnchors(root, navigate));
      cleanups.push(wireHeaderLogout(root, signOut));

      const manualCard = findCardByText(root, 'Enter manually');
      if (manualCard) {
        cleanups.push(
          makeInteractiveCard(
            manualCard,
            () => {
              navigate('/supplier-single');
            },
            'enter-manually-card',
          ),
        );
      }

      const backLink = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href]')).find((anchor) =>
        anchor.textContent?.includes('Make a payment'),
      );

      if (backLink) {
        const handler = (event: Event) => {
          event.preventDefault();
          navigate('/new-payment');
        };
        backLink.addEventListener('click', handler);
        cleanups.push(() => backLink.removeEventListener('click', handler));
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
      sourceHtml={referenceAssets.selectTypeHtml}
      wireUp={wireUp}
      styleId="select-type"
    />
  );
}
