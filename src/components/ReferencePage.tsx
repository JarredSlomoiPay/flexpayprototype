import { useEffect, useMemo, useRef } from 'react';
import { parseReferencePage } from '../lib/referenceParser';
import type { CleanupFn } from '../lib/domHelpers';

interface ReferencePageProps {
  sourceHtml: string;
  wireUp?: (root: HTMLElement) => void | CleanupFn;
  styleId: string;
}

export function ReferencePage({ sourceHtml, wireUp, styleId }: ReferencePageProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => parseReferencePage(sourceHtml), [sourceHtml]);

  useEffect(() => {
    const existing = document.head.querySelector<HTMLStyleElement>(`style[data-reference-style='${styleId}']`);
    if (existing) {
      existing.remove();
    }

    const styleEl = document.createElement('style');
    styleEl.dataset.referenceStyle = styleId;
    styleEl.textContent = parsed.style;
    document.head.appendChild(styleEl);

    return () => {
      styleEl.remove();
    };
  }, [parsed.style, styleId]);

  useEffect(() => {
    if (!wireUp || !rootRef.current) {
      return;
    }

    return wireUp(rootRef.current);
  }, [wireUp]);

  return <div ref={rootRef} dangerouslySetInnerHTML={{ __html: parsed.markup }} />;
}
