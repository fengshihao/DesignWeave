export function WeaveMark({ size = 36 }: { size?: number }) {
  return <WeaveIcon size={size} />;
}

export function WeaveIcon({ size = 56 }: { size?: number }) {
  return (
    <img
      className="weave-icon"
      src="/brand/designweave.png"
      width={size}
      height={size}
      alt=""
    />
  );
}
