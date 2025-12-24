import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { TrainerStateProvider } from './state/TrainerStateProvider';
import './styles/index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root container missing');
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <TrainerStateProvider>
        <App />
      </TrainerStateProvider>
    </BrowserRouter>
  </StrictMode>
);
