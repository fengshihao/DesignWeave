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
        strokeWidth="1.4"
      />
      <path
        d="M9 9.4c4.2 0 4.2 13.2 14 13.2M9 22.6c4.2 0 4.2-13.2 14-13.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <circle cx="9" cy="9.4" r="1.15" fill="currentColor"/>
      <circle cx="23" cy="22.6" r="1.15" fill="currentColor"/>
      <circle cx="9" cy="22.6" r="1.15" fill="currentColor"/>
      <circle cx="23" cy="9.4" r="1.15" fill="currentColor"/>
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
