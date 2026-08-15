import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import AppRouter from './routes/AppRouter';

// Applied synchronously before mount so there's no flash of the wrong theme.
document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppRouter />
  </React.StrictMode>
);
