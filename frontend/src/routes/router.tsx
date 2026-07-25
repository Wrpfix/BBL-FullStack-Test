import { createBrowserRouter } from 'react-router';
import { AppLayout } from '../layouts/AppLayout';
import { BookmarksPage } from '../pages/BookmarksPage';
import { CollectionsPage } from '../pages/CollectionsPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <BookmarksPage /> },
      { path: 'collections', element: <CollectionsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
