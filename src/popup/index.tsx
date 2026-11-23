import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CrashGuard } from '../shared/CrashGuard';
import App from './App';
import '../styles.css';
import { initTheme } from '../shared/theme';

initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <CrashGuard>
      <App />
    </CrashGuard>
  </StrictMode>,
);
