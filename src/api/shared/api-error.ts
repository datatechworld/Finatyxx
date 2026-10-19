export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(
    statusCode: number,
    code: string,
    message: string,
  ) {
    super(message);

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isApiError(
  error: unknown,
): error is ApiError {
  return error instanceof ApiError;
}

export function getDatabaseErrorCode(
  error: unknown,
): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}