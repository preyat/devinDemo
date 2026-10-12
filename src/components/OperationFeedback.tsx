import { Alert } from "react-bootstrap";
import type { OperationResult } from "@/server/operation";

/** Renders the result of a server action that returned an OperationResult. */
export function OperationFeedback({ result }: { result: OperationResult | null }) {
  if (!result) return null;
  return (
    <Alert variant={result.ok ? "success" : "danger"} className="py-2 mb-3" role="status" data-testid="operation-feedback">
      {result.ok ? "Success: " : `Blocked (${result.code}): `}
      {result.message}
    </Alert>
  );
}
