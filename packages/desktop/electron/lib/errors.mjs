export class FyluneError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "FyluneError";
    this.code = code;
    this.details = details;
  }
}

export function toPublicError(error) {
  if (error instanceof FyluneError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    };
  }

  if (error?.code === "EACCES" || error?.code === "EPERM") {
    return {
      code: "PERMISSION_DENIED",
      message: "Fylune does not have permission to access this file.",
    };
  }

  if (error?.code === "ENOENT") {
    return {
      code: "FILE_NOT_FOUND",
      message: "The file is no longer available on disk.",
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Fylune could not complete the operation.",
  };
}
