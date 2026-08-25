export type ErrorCode =
  | "INVALID_INPUT"
  | "USER_NOT_FOUND"
  | "AVATAR_UNREACHABLE"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_ERROR"
  | "NETWORK_ERROR"
  | "IMAGE_INVALID"
  | "STYLE_NOT_FOUND"
  | "RATE_LIMITED"
  | "BAD_REQUEST"
  | "RENDER_FAILED";

/**
 * One distinct, user-facing message per failure mode (spec §4/§10).
 * Never surface raw stack traces to clients.
 */
const USER_MESSAGES: Record<ErrorCode, string> = {
  INVALID_INPUT: "That doesn't look like a valid GitHub profile URL or username. Try https://github.com/<username>.",
  USER_NOT_FOUND: "No public GitHub account found for that username — it may not exist, be deleted, or be suspended.",
  AVATAR_UNREACHABLE: "We couldn't download that profile's avatar from GitHub's CDN.",
  GITHUB_RATE_LIMITED: "GitHub's API rate limit was exhausted on our side. Please try again in a few minutes.",
  GITHUB_ERROR: "GitHub's API returned an unexpected error. Please try again.",
  NETWORK_ERROR: "Could not reach GitHub. Check your network connection and try again.",
  IMAGE_INVALID: "The avatar image could not be processed — it may be corrupted or in an unsupported format.",
  STYLE_NOT_FOUND: "Unknown art style.",
  RATE_LIMITED: "Too many requests from your network. Please slow down and retry shortly.",
  BAD_REQUEST: "Malformed request.",
  RENDER_FAILED: "Rendering failed for this artwork.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  private readonly detail?: string;

  constructor(code: ErrorCode, status = 400, detail?: string) {
    super(detail ? `${USER_MESSAGES[code]} [${detail}]` : USER_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }

  get userMessage(): string {
    return USER_MESSAGES[this.code];
  }

  get detailMessage(): string | undefined {
    return this.detail;
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError("RENDER_FAILED", 500);
}
