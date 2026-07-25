import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useParams } from 'react-router';
import { useApi } from '../api/useApi';
import type { Bookmark, Collection, Paginated } from '../api/types';
import { AsyncState } from '../components/AsyncState';
import { useAsync } from '../hooks/useAsync';

export function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();

  const collectionState = useAsync<Collection>(() => api<Collection>(`/collections/${id}`), [api, id]);
  const bookmarksState = useAsync<Paginated<Bookmark>>(
    () => api<Paginated<Bookmark>>(`/collections/${id}/bookmarks?limit=100`),
    [api, id],
  );

  return (
    <Box>
      <Breadcrumbs sx={{ mb: 2 }}>
        <Link component={RouterLink} to="/collections" underline="hover">
          Collections
        </Link>
        <Typography color="text.primary">{collectionState.data?.name ?? id}</Typography>
      </Breadcrumbs>

      <AsyncState loading={collectionState.loading} error={collectionState.error}>
        <Typography variant="h4" gutterBottom>
          {collectionState.data?.name}
        </Typography>

        <Typography variant="h6" sx={{ mt: 3 }}>
          Bookmarks
        </Typography>
        <AsyncState loading={bookmarksState.loading} error={bookmarksState.error}>
          {bookmarksState.data && bookmarksState.data.data.length === 0 && (
            <Typography color="text.secondary">No bookmarks in this collection.</Typography>
          )}
          <List>
            {bookmarksState.data?.data.map((bookmark) => (
              <ListItemButton
                key={bookmark.id}
                component={RouterLink}
                to={`/bookmarks/${bookmark.id}`}
              >
                <ListItemText primary={bookmark.title} secondary={bookmark.url} />
              </ListItemButton>
            ))}
          </List>
        </AsyncState>
      </AsyncState>
    </Box>
  );
}
