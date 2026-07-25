import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useParams } from 'react-router';
import { useApi } from '../api/useApi';
import type { Bookmark } from '../api/types';
import { AsyncState } from '../components/AsyncState';
import { useAsync } from '../hooks/useAsync';

export function BookmarkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const { data, loading, error } = useAsync<Bookmark>(() => api<Bookmark>(`/bookmarks/${id}`), [api, id]);

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/bookmarks" underline="hover">
          Bookmarks
        </Link>
        <Typography color="text.primary">{data?.title ?? id}</Typography>
      </Breadcrumbs>

      <AsyncState loading={loading} error={error}>
        {data && (
          <Stack spacing={1}>
            <Typography variant="h4">{data.title}</Typography>
            <Link href={data.url} target="_blank" rel="noopener noreferrer">
              {data.url}
            </Link>
            {data.notes && <Typography sx={{ whiteSpace: 'pre-wrap' }}>{data.notes}</Typography>}
            <Typography variant="body2" color="text.secondary">
              {data.collectionId ? (
                <Link component={RouterLink} to={`/collections/${data.collectionId}`}>
                  View collection
                </Link>
              ) : (
                'Unsorted'
              )}
            </Typography>
          </Stack>
        )}
      </AsyncState>
    </Box>
  );
}
