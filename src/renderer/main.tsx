import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/layout.css';

const root = document.getElementById('root');
if (!root) throw new Error('Renderer root element missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
