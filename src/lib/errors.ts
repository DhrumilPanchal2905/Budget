export class ApiError extends Error {
  status: number;
  errors?: Record<string, string>;
  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export const Errors = {
  unauthenticated: () => new ApiError(401, "Please sign in to continue."),
  forbidden: () => new ApiError(403, "You do not have permission to perform this action."),
  notFound: (what = "Record") => new ApiError(404, `${what} not found.`),
  badRequest: (msg = "Invalid request.", errors?: Record<string, string>) => new ApiError(400, msg, errors),
  conflict: (msg: string) => new ApiError(409, msg),
  tooMany: () => new ApiError(429, "Too many attempts. Please wait a moment and try again."),
  planLimit: (msg: string) => new ApiError(402, msg),
};
