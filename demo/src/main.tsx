import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createDemoAdapter } from './adapters';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App adapter={createDemoAdapter(window.location.search)} />
  </StrictMode>,
);
