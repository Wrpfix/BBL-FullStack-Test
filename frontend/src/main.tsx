import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Auth0ProviderWithNavigate } from './auth/Auth0ProviderWithNavigate';
import { router } from './routes/router';
import { theme } from './theme';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Auth0ProviderWithNavigate router={router}>
        <RouterProvider router={router} />
      </Auth0ProviderWithNavigate>
    </ThemeProvider>
  </StrictMode>,
);
