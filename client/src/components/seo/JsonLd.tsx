import React from "react";

interface JsonLdProps {
  data: Record<string, unknown>;
}

/**
 * Renders safe JSON-LD structured data with anti-XSS script escaping.
 */
export function JsonLd({ data }: JsonLdProps) {
  const jsonString = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonString }}
    />
  );
}

