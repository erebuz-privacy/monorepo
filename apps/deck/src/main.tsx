import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import EmailGate from './EmailGate';
import './styles/tokens.css';
import './styles/base.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EmailGate>
      <App />
    </EmailGate>
  </React.StrictMode>
);
