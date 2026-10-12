export type OperationErrorCode = "validation" | "forbidden" | "not_found" | "invalid_transition" | "rule_violation";

/** Expected, user-facing failures. Anything else is a bug and is rethrown. */
export class OperationError extends Error {
  constructor(
    readonly code: OperationErrorCode,
    message: string,
    /** Extra structured context for the denied audit event, e.g. { reasons: ["KYC_NOT_APPROVED"] }. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OperationError";
  }
}
