const paths = {
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  pin: 'M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  route:
    'M7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM21 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9 5h7a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h5',
  map: 'm9 4-6 3v14l6-3 6 3 6-3V4l-6 3-6-3Zm0 0v14m6-11v14',
  book: 'M12 6c-3-2-6-3-10-2v16c4-1 7 0 10 2m0-16c3-2 6-3 10-2v16c-4-1-7 0-10 2V6Z',
  backpack:
    'M8 5V4a4 4 0 0 1 8 0v1M7 5h10a3 3 0 0 1 3 3v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a3 3 0 0 1 3-3Zm1 9h8v7M8 10h8',
  report: 'M8 3H5v18h14V3h-3M8 2h8v4H8V2Zm0 9h8m-8 4h5',
  settings:
    'M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm6 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  check: 'm5 12 4 4L19 6',
  shield: 'm12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5l8-3Zm-4 9 3 3 5-5',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M6 18 18 6',
  compass: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-6-3-2 4-4 2 2-4 4-2Z',
} as const

export default function Icon({
  name,
  className = '',
}: {
  name: keyof typeof paths
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      <path d={paths[name]} />
    </svg>
  )
}
