/** beautiful-bb's sidebar wave, so Armada says "working" the way the rest of the user's bb does. */
export function WaveSpinner({ label }: { label?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      role={label === undefined ? undefined : "img"}
      aria-label={label}
      aria-hidden={label === undefined ? true : undefined}
      className="armada-wave"
    >
      <rect x="2" y="3" width="3" height="10" rx="1.5" />
      <rect x="6.5" y="3" width="3" height="10" rx="1.5" />
      <rect x="11" y="3" width="3" height="10" rx="1.5" />
    </svg>
  );
}
