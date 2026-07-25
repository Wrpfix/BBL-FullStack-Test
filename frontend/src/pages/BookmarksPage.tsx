import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { useApi } from '../api/useApi';
import type { Bookmark, Collection, Paginated } from '../api/types';
import { AsyncState } from '../components/AsyncState';
import { useAsync } from '../hooks/useAsync';

const UNSORTED = 'unsorted';

export function BookmarksPage() {
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const collectionFilter = searchParams.get('collectionId') ?? '';

  const collectionsState = useAsync<Paginated<Collection>>(
    () => api<Paginated<Collection>>('/collections?limit=100'),
    [api],
  );

  const bookmarksState = useAsync<Paginated<Bookmark>>(() => {
    const query = collectionFilter ? `?collectionId=${collectionFilter}&limit=100` : '?limit=100';
    return api<Paginated<Bookmark>>(`/bookmarks${query}`);
  }, [api, collectionFilter]);

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  function handleFilterChange(value: string) {
    if (value) {
      setSearchParams({ collectionId: value });
    } else {
      setSearchParams({});
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || !title.trim()) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      await api('/bookmarks', {
        method: 'POST',
        body: JSON.stringify({
          url,
          title,
          notes: notes.trim() || undefined,
          collectionId: collectionId ? Number(collectionId) : undefined,
        }),
      });
      setUrl('');
      setTitle('');
      setNotes('');
      setCollectionId('');
      bookmarksState.reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create bookmark');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    await api(`/bookmarks/${id}`, { method: 'DELETE' });
    bookmarksState.reload();
  }

  const collectionName = (id: number | null) => {
    if (id === null) return 'Unsorted';
    return collectionsState.data?.data.find((c) => c.id === id)?.name ?? `#${id}`;
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Bookmarks
      </Typography>

      <TextField
        select
        size="small"
        label="Filter by collection"
        value={collectionFilter}
        onChange={(e) => handleFilterChange(e.target.value)}
        sx={{ minWidth: 220, mb: 3 }}
      >
        <MenuItem value="">All</MenuItem>
        {collectionsState.data?.data.map((c) => (
          <MenuItem key={c.id} value={String(c.id)}>
            {c.name}
          </MenuItem>
        ))}
      </TextField>

      <Box component="form" onSubmit={handleCreate} sx={{ mb: 3 }}>
        <Stack spacing={1}>
          <TextField size="small" label="URL" value={url} onChange={(e) => setUrl(e.target.value)} required />
          <TextField size="small" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField
            size="small"
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
          />
          <TextField
            select
            size="small"
            label="Collection"
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
          >
            <MenuItem value="">{UNSORTED}</MenuItem>
            {collectionsState.data?.data.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
          <Button type="submit" variant="contained" disabled={creating || !url.trim() || !title.trim()}>
            Add bookmark
          </Button>
        </Stack>
      </Box>
      {createError && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {createError}
        </Typography>
      )}

      <AsyncState loading={bookmarksState.loading} error={bookmarksState.error}>
        {bookmarksState.data && bookmarksState.data.data.length === 0 && (
          <Typography color="text.secondary">No bookmarks yet.</Typography>
        )}
        <List>
          {bookmarksState.data?.data.map((bookmark) => (
            <ListItem
              key={bookmark.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={() => handleDelete(bookmark.id)}>
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemButton component={RouterLink} to={`/bookmarks/${bookmark.id}`}>
                <ListItemText
                  primary={bookmark.title}
                  secondary={`${bookmark.url} · ${collectionName(bookmark.collectionId)}`}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </AsyncState>
    </Box>
  );
}
