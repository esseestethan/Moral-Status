import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import MoralStatusMap from './MoralStatusMap.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MoralStatusMap />
  </React.StrictMode>,
);
