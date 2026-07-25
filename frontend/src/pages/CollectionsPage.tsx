import DeleteIcon from '@mui/icons-material/Delete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { Link as RouterLink } from 'react-router';
import { useApi } from '../api/useApi';
import type { Collection, Paginated } from '../api/types';
import { AsyncState } from '../components/AsyncState';
import { useAsync } from '../hooks/useAsync';

export function CollectionsPage() {
  const api = useApi();
  const { data, loading, error, reload } = useAsync<Paginated<Collection>>(
    () => api<Paginated<Collection>>('/collections?limit=100'),
    [api],
  );

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | undefined>(undefined);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(undefined);
    try {
      await api('/collections', { method: 'POST', body: JSON.stringify({ name }) });
      setName('');
      reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create collection');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    await api(`/collections/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Collections
      </Typography>

      <Box component="form" onSubmit={handleCreate} sx={{ display: 'flex', gap: 1, mb: 3 }}>
        <TextField
          size="small"
          label="New collection name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          fullWidth
        />
        <Button type="submit" variant="contained" disabled={creating || !name.trim()}>
          Create
        </Button>
      </Box>
      {createError && (
        <Typography color="error" variant="body2" sx={{ mb: 2 }}>
          {createError}
        </Typography>
      )}

      <AsyncState loading={loading} error={error}>
        {data && data.data.length === 0 && (
          <Typography color="text.secondary">No collections yet.</Typography>
        )}
        <List>
          {data?.data.map((collection) => (
            <ListItem
              key={collection.id}
              disablePadding
              secondaryAction={
                <IconButton edge="end" aria-label="delete" onClick={() => handleDelete(collection.id)}>
                  <DeleteIcon />
                </IconButton>
              }
            >
              <ListItemButton component={RouterLink} to={`/collections/${collection.id}`}>
                <ListItemText primary={collection.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </AsyncState>
    </Box>
  );
}
