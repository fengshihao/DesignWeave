"use client";

import { useId } from "react";

export function WeaveMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect
        x="3.5"
        y="3.5"
        width="25"
        height="25"
        rx="6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M10 11.5c3.2 0 3.2 9 6.4 9s3.2-9 6.4-9M10 20.5c3.2 0 3.2-9 6.4-9s3.2 9 6.4 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Theme-aware plate: follows --paper / --accent / --ink so a later green paper still fits. */
export function WeaveIcon({ size = 56 }: { size?: number }) {
  const clip = `dw-weave-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className="weave-icon"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <defs>
        <clipPath id={clip}>
          <rect x="16" y="6" width="12" height="20" />
        </clipPath>
      </defs>
      <rect className="weave-icon-plate" x="1.2" y="1.2" width="29.6" height="29.6" rx="7" />
      <path
        className="weave-icon-weft"
        d="M8.6 20.6c3.4 0 3.4-9.2 6.8-9.2s3.4 9.2 6.8 9.2"
      />
      <path
        className="weave-icon-warp"
        d="M8.6 11.4c3.4 0 3.4 9.2 6.8 9.2s3.4-9.2 6.8-9.2"
      />
      <path
        className="weave-icon-weft"
        clipPath={`url(#${clip})`}
        d="M8.6 20.6c3.4 0 3.4-9.2 6.8-9.2s3.4 9.2 6.8 9.2"
      />
    </svg>
  );
}
