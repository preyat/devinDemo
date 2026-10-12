export type OperationErrorCode = "validation" | "forbidden" | "not_found" | "invalid_transition" | "rule_violation";

/** Expected, user-facing failures. Anything else is a bug and is rethrown. */
export class OperationError extends Error {
  constructor(
    readonly code: OperationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OperationError";
  }
}
