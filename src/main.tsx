import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Silently capture and suppress benign development WebSocket/HMR errors and rejections
if (typeof window !== 'undefined') {
  const isWebsocketError = (err: any): boolean => {
    const msg = String(err?.message || err || '');
    return (
      msg.includes('WebSocket') || 
      msg.includes('websocket') || 
      msg.includes('HMR') || 
      msg.includes('vite') || 
      msg.includes('Vite')
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    if (isWebsocketError(event.reason)) {
      console.warn('Silently suppressed benign dev-server WebSocket rejection:', event.reason);
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    if (isWebsocketError(event.error) || isWebsocketError(event.message)) {
      console.warn('Silently suppressed benign dev-server WebSocket error:', event.message);
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
