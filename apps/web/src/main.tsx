import React from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { arSA } from '@clerk/localizations';
import App from './App.js';
import './style.css';

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim();
const application = <App clerkConfigured={Boolean(publishableKey)} />;

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {publishableKey ? (
      <ClerkProvider
        publishableKey={publishableKey}
        localization={arSA}
        afterSignOutUrl="#/home"
        appearance={{
          variables: {
            colorPrimary: '#008c85',
            borderRadius: '0.9rem',
            fontFamily: 'Cairo, Tahoma, Arial, sans-serif',
          },
        }}
      >
        {application}
      </ClerkProvider>
    ) : (
      application
    )}
  </React.StrictMode>,
);
