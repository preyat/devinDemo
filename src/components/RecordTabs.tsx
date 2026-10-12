"use client";

import type { ReactNode } from "react";
import { Tab, Tabs } from "react-bootstrap";

export interface RecordTab {
  key: string;
  title: ReactNode;
  content: ReactNode;
}

/** Tabbed sections for a record detail view; content is server-rendered and passed in. */
export function RecordTabs({ tabs, id }: { tabs: RecordTab[]; id: string }) {
  return (
    <Tabs id={id} defaultActiveKey={tabs[0]?.key} className="mb-3" mountOnEnter={false}>
      {tabs.map((t) => (
        <Tab key={t.key} eventKey={t.key} title={t.title}>
          {t.content}
        </Tab>
      ))}
    </Tabs>
  );
}
