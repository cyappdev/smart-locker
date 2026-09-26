import type { ErrorCode } from '../errors/error-code.ts';

export interface ErrorResponse {
  code: ErrorCode;
  message: string;
  details?: { field: string; message: string }[];
}
