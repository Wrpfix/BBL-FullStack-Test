import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { ReactNode } from 'react';

interface Props {
  loading: boolean;
  error: string | undefined;
  children: ReactNode;
}

// Shared loading/error shell so every page renders the same basic states.
export function AsyncState({ loading, error, children }: Props) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  return <>{children}</>;
}
