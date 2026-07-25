import BookmarkIcon from '@mui/icons-material/Bookmark';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth0 } from '@auth0/auth0-react';
import AppBar from '@mui/material/AppBar';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import IconButton from '@mui/material/IconButton';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { NavLink, Outlet } from 'react-router';
import { useMe } from '../hooks/useMe';

export function AppLayout() {
  const { logout } = useAuth0();
  const { data: me } = useMe();

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

          {me && (
            <Tooltip title={me.email}>
              <Avatar sx={{ width: 28, height: 28, ml: 2, mr: 1, fontSize: 14 }}>
                {me.email.charAt(0).toUpperCase()}
              </Avatar>
            </Tooltip>
          )}
          <Tooltip title="Log out">
            <IconButton
              color="inherit"
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
            >
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Outlet />
      </Container>
    </Box>
  );
}
