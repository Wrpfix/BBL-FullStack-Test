function required(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  apiBaseUrl: required('VITE_API_BASE_URL'),
  auth0: {
    domain: required('VITE_AUTH0_DOMAIN'),
    clientId: required('VITE_AUTH0_CLIENT_ID'),
    audience: required('VITE_AUTH0_AUDIENCE'),
    callbackUrl: required('VITE_AUTH0_CALLBACK_URL'),
  },
};
