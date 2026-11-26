import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {ErrorBoundary} from './ui/ErrorBoundary.tsx';
import './index.css';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason || '');
    const stack = reason instanceof Error ? reason.stack || '' : '';
    if (
      msg.includes('WebSocket closed without opened') &&
      (stack.includes('@vite/client') || msg.includes('WebSocket'))
    ) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
