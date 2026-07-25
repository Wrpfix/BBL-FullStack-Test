import { createBrowserRouter, Navigate } from 'react-router';
import { RequireAuth } from '../auth/RequireAuth';
import { AppLayout } from '../layouts/AppLayout';
import { BookmarkDetailPage } from '../pages/BookmarkDetailPage';
import { BookmarksPage } from '../pages/BookmarksPage';
import { CallbackPage } from '../pages/CallbackPage';
import { CollectionDetailPage } from '../pages/CollectionDetailPage';
import { CollectionsPage } from '../pages/CollectionsPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  { path: '/callback', element: <CallbackPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/bookmarks" replace /> },
          { path: 'bookmarks', element: <BookmarksPage /> },
          { path: 'bookmarks/:id', element: <BookmarkDetailPage /> },
          { path: 'collections', element: <CollectionsPage /> },
          { path: 'collections/:id', element: <CollectionDetailPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
