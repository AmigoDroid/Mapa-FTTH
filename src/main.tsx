import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { NetworkProvider } from './store/networkStore';
import { AuthProvider } from './store/authStore';
import { SystemAuthProvider } from './store/systemAuthStore';
import { SystemApp } from './system/SystemApp';

function RootEntry() {
  const isSystemRoute = window.location.pathname.startsWith('/system');
  if (isSystemRoute) {
    return (
      <SystemAuthProvider>
        <SystemApp />
      </SystemAuthProvider>
    );
  }

  return (
    <AuthProvider>
      <NetworkProvider>
        <App />
      </NetworkProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootEntry />
  </StrictMode>
);
