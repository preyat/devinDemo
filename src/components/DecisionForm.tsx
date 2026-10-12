"use client";

import { useActionState, type ReactNode } from "react";
import { Button, Form } from "react-bootstrap";
import type { OperationResult } from "@/server/operation";
import { OperationFeedback } from "./OperationFeedback";

export interface DecisionOption {
  value: string;
  label: string;
  variant: string;
  icon?: ReactNode;
}

interface DecisionFormProps {
  /** Server action returning an OperationResult; receives `decision`, `note` and `fields`. */
  action: (prev: OperationResult | null, formData: FormData) => Promise<OperationResult>;
  fields: Record<string, string>;
  options: DecisionOption[];
  noteLabel: string;
  notePlaceholder?: string;
  /** id of the note textarea; set when several DecisionForms share a page. */
  noteId?: string;
  /** Extra inputs rendered above the note (e.g. an amount field or a selection list). */
  extraFields?: ReactNode;
  /** Rendered above the buttons, e.g. why a decision is blocked. */
  notice?: ReactNode;
  /** When set, the record is read-only: show this instead of the form controls. */
  readOnlyMessage?: string;
}

/**
 * Generic note + decision buttons form. Validation and rules live in the server action's service;
 * this component only renders the OperationResult.
 */
export function DecisionForm({ action, fields, options, noteLabel, notePlaceholder, noteId = "decision-note", extraFields, notice, readOnlyMessage }: DecisionFormProps) {
  const [result, formAction, pending] = useActionState(action, null);
  return (
    <Form action={formAction}>
      <OperationFeedback result={result} />
      {readOnlyMessage ? (
        <p className="small text-muted mb-0" data-testid="read-only">{readOnlyMessage}</p>
      ) : (
        <>
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {extraFields}
          <Form.Group className="mb-2" controlId={noteId}>
            <Form.Label className="small">{noteLabel}</Form.Label>
            <Form.Control as="textarea" name="note" rows={2} maxLength={500} placeholder={notePlaceholder} />
          </Form.Group>
          {notice}
          <div className="d-flex flex-wrap gap-2">
            {options.map((o) => (
              <Button key={o.value} type="submit" name="decision" value={o.value} variant={o.variant} size="sm" disabled={pending}>
                {o.icon} {o.label}
              </Button>
            ))}
          </div>
        </>
      )}
    </Form>
  );
}
