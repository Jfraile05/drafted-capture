import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { initTheme } from '../shared/theme';
import { Options } from './Options';

initTheme();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Options />
    </StrictMode>,
  );
}
