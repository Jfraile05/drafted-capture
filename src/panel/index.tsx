import '../styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CrashGuard } from '../shared/CrashGuard';
import { initTheme } from '../shared/theme';
import { App } from './App';

initTheme();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <CrashGuard>
        <App />
      </CrashGuard>
    </StrictMode>,
  );
}
