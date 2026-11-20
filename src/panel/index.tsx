import '../styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CrashGuard } from '../shared/CrashGuard';
import { App } from './App';

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
