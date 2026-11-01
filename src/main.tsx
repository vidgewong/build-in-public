import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource-variable/bodoni-moda/opsz.css';
import '@fontsource-variable/jost/wght.css';
import '@fontsource-variable/noto-serif-sc/wght.css';
import './styles.css';
import './admin.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
