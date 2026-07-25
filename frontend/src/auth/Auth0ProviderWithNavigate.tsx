import { Auth0Provider, type AppState } from '@auth0/auth0-react';
import type { ReactNode } from 'react';
import type { createBrowserRouter } from 'react-router';
import { config } from '../config';

interface Props {
  router: ReturnType<typeof createBrowserRouter>;
  children: ReactNode;
}

// Wired for Authorization Code + PKCE (S256), never implicit flow:
// auth0-spa-js (which @auth0/auth0-react wraps) only ever performs the
// authorization_code grant with a PKCE code_verifier/code_challenge pair
// for SPA clients — see README/API_DESIGN.md for the verification notes.
export function Auth0ProviderWithNavigate({ router, children }: Props) {
  const onRedirectCallback = (appState?: AppState) => {
    router.navigate(appState?.returnTo ?? '/');
  };

  return (
    <Auth0Provider
      domain={config.auth0.domain}
      clientId={config.auth0.clientId}
      authorizationParams={{
        redirect_uri: config.auth0.callbackUrl,
        audience: config.auth0.audience,
        scope: 'openid profile email',
      }}
      onRedirectCallback={onRedirectCallback}
      useRefreshTokens
      cacheLocation="memory"
    >
      {children}
    </Auth0Provider>
  );
}
