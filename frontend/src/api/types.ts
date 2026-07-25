export interface Me {
  id: number;
  auth0Sub: string;
  email: string;
  createdAt: string;
}

export interface Collection {
  id: number;
  ownerId: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bookmark {
  id: number;
  ownerId: number;
  collectionId: number | null;
  url: string;
  title: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}
