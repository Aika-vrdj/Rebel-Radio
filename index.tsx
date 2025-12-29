
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';

console.log("Rebel Radio: Mounting Application...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
