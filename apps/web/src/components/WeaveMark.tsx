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

export function WeaveIcon({ size = 56 }: { size?: number }) {
  return (
    <img
      className="weave-icon"
      src="/brand/designweave.svg"
      width={size}
      height={size}
      alt=""
    />
  );
}
