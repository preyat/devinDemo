"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, Col, Form, Row } from "react-bootstrap";
import { Search } from "lucide-react";

export interface FilterSelect {
  name: string;
  label: string;
  /** First option is the default. */
  options: { value: string; label: string }[];
}

/** URL-driven search + select filters for a queue. Changing any filter resets `page`. */
export function QueueFilters({ searchPlaceholder, selects }: { searchPlaceholder: string; selects: FilterSelect[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  const apply = (updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v) params.set(k, v);
      else params.delete(k);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <Form
      className="mb-3"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q: q.trim() });
      }}
    >
      <Row className="g-2 align-items-end">
        <Col xs={12}>
          <Form.Label className="small mb-1" htmlFor="queue-search">Search</Form.Label>
          <div className="d-flex gap-1">
            <Form.Control id="queue-search" size="sm" value={q} placeholder={searchPlaceholder} onChange={(e) => setQ(e.target.value)} />
            <Button type="submit" size="sm" variant="outline-secondary" aria-label="Search">
              <Search size={16} />
            </Button>
          </div>
        </Col>
        {selects.map((s) => (
          <Col key={s.name} xs={6} md={4} xxl>
            <Form.Label className="small mb-1" htmlFor={`filter-${s.name}`}>{s.label}</Form.Label>
            <Form.Select
              id={`filter-${s.name}`}
              size="sm"
              value={searchParams.get(s.name) ?? s.options[0].value}
              onChange={(e) => apply({ [s.name]: e.target.value === s.options[0].value ? "" : e.target.value })}
            >
              {s.options.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Form.Select>
          </Col>
        ))}
      </Row>
    </Form>
  );
}
