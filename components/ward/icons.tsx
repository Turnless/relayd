export const ICON = {
  graph: "M6 4a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM18 4a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM12 16a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM8 6h8M7 7.6l4 8.6M17 7.6l-4 8.6",
  pill: "M8.5 15.5l7-7M10.4 4.6a4.95 4.95 0 0 1 7 7l-5.8 5.8a4.95 4.95 0 0 1-7-7z",
  leftout: "M4 5h16v11H9l-5 4V5zM9.5 8l5 5M14.5 8l-5 5",
  sorted: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM8 12.5l2.8 2.8L16.5 9.5",
  note: "M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5",
  ask: "M5 5h14v10h-6l-4 4v-4H5zM10 9.2a2 2 0 1 1 2.8 1.8c-.6.3-.8.7-.8 1.2M12 13.6v.1",
  how: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  sun: "M12 7a5 5 0 1 0 0 10a5 5 0 1 0 0-10zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  panel: "M4 5h16v14H4zM9 5v14M14.5 10l-2 2 2 2",
  back: "M15 6l-6 6 6 6",
};

export function Icon({ d, size = 20, width = 1.7 }: { d: string; size?: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none" }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
