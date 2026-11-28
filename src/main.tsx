import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/tinos/400.css';
import '@fontsource/tinos/400-italic.css';
import '@fontsource/tinos/700.css';
import '@fontsource/tinos/700-italic.css';
import App from './App.tsx';
import {ErrorBoundary} from './ui/ErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onRegisterError(err) {
      console.warn('[PWA] Service worker registration skipped:', err);
    },
  });
}

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
