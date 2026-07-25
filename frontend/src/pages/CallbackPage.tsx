import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

// Transient landing spot for the Auth0 redirect back from
// /authorize?...&code=...&state=... — Auth0Provider detects the code/state
// pair on mount, exchanges it (with the PKCE code_verifier it stashed
// before redirecting out) for tokens, then onRedirectCallback navigates
// away from here. Nothing to render but a spinner.
export function CallbackPage() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
      <CircularProgress />
    </Box>
  );
}
