/** Seconds each dot trails the top-left one: the wave runs diagonally. */
const DELAYS = [0, 0.12, 0.24, 0.12, 0.24, 0.36, 0.24, 0.36, 0.48] as const;

/** beautiful-bb's working spinner, so the sidebar and the chat say "working" the same way. */
export function WaveSpinner({ label }: { label?: string }) {
  return (
    <span
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className="armada-wave"
    >
      {DELAYS.map((delay, index) => (
        <span key={index} style={{ animationDelay: `${delay}s` }} />
      ))}
    </span>
  );
}
