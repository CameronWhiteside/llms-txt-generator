// HTTP Status Codes
export const STATUS_CODES = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  INVALID_REQUEST_FORMAT: "Invalid request format",
  INVALID_URLS: "These aren't valid URLs",
  INTERNAL_ERROR: "Internal server error",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  NOT_FOUND: "Not found",
} as const;

// Content Types
export const CONTENT_TYPES = {
  PLAIN_TEXT: "text/plain",
  JSON: "application/json",
  HTML: "text/html",
} as const;

// Response Headers
export const DEFAULT_HEADERS = {
  "Content-Type": CONTENT_TYPES.PLAIN_TEXT,
} as const;
