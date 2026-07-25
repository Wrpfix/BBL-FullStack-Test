import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(body: ApiErrorBody, statusCode: number) {
    super(Array.isArray(body.message) ? body.message.join(', ') : body.message);
    this.statusCode = statusCode;
  }
}
