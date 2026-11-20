import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface PrintPortalProps {
  paperSize?: 'A4' | 'F4';
  children: React.ReactNode;
}

export const PrintPortal: React.FC<PrintPortalProps> = ({ paperSize = 'A4', children }) => {
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('hubin-print-portal') as HTMLDivElement | null;
    let createdBySelf = false;
    if (!el) {
      el = document.createElement('div');
      el.id = 'hubin-print-portal';
      document.body.appendChild(el);
      createdBySelf = true;
    }
    document.body.classList.add('hubin-has-print-portal');
    setPortalEl(el);

    return () => {
      document.body.classList.remove('hubin-has-print-portal');
      if (createdBySelf && el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };
  }, []);

  if (!portalEl) return null;

  const pageCssSize = paperSize === 'F4' ? '215mm 330mm' : 'A4 portrait';
  const pageMinHeight = paperSize === 'F4' ? '315mm' : '282mm';

  return createPortal(
    <>
      <style>{`
        @page {
          size: ${pageCssSize};
          margin: 6mm 10mm 7mm 10mm;
        }
        @media print {
          :root {
            --hubin-print-page-height: ${pageMinHeight};
          }
        }
      `}</style>
      {children}
    </>,
    portalEl
  );
};
