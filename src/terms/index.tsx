import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { Terms } from './Terms';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Terms />
    </StrictMode>,
  );
}
