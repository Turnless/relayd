/** Relayd mark: three notes joined, one flagged. */
export default function Logo({ size = 32, light = true }: { size?: number; light?: boolean }) {
  const bg = light ? "#F3EEF2" : "#241B22";
  const fg = light ? "#241B22" : "#F3EEF2";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flex: "none" }}>
      <rect width="32" height="32" rx="9" fill={bg} />
      <circle cx="10" cy="11" r="3.2" fill={fg} />
      <circle cx="22" cy="11" r="3.2" fill={fg} />
      <circle cx="16" cy="22" r="3.4" fill="#C8323C" />
      <path d="M10 11L22 11L16 22Z" fill="none" stroke={fg} strokeWidth="1.6" />
    </svg>
  );
}
