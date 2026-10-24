import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { htmlLang } from './lib/i18n';
import { getRouter } from './router';
import './styles.css';

document.documentElement.lang = htmlLang();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={getRouter()} />
  </StrictMode>,
);
