import BookmarkIcon from '@mui/icons-material/Bookmark';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet } from 'react-router';

export function AppLayout() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" color="primary" enableColorOnDark>
        <Toolbar>
          <BookmarkIcon sx={{ mr: 1 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            Bookmarks
          </Typography>
          <Button color="inherit" component={NavLink} to="/">
            Bookmarks
          </Button>
          <Button color="inherit" component={NavLink} to="/collections">
            Collections
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
