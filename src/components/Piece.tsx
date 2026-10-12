const details = [
  <><path d="M13 17v-2a9 9 0 0 1 18 0v2"/><rect x="10" y="16" width="5" height="9" rx="2"/><rect x="29" y="16" width="5" height="9" rx="2"/></>,
  <rect x="13" y="15" width="18" height="6" rx="3" fill="#17191b" stroke="#f5f4ed"/>,
  <><rect x="14" y="28" width="16" height="10" rx="2" fill="#17191b"/><circle cx="22" cy="33" r="3" fill="none"/></>,
  <path d="M15 27l13 14" strokeWidth="4"/>,
]

export default function Piece({ index, className = '' }: { index: number; className?: string }) {
  return <span className={`piece piece-${index % 4} ${className}`} aria-hidden="true">
    <svg viewBox="0 0 44 48" fill="none">
      <circle className="piece-fill" cx="22" cy="15" r="9"/>
      <path className="piece-fill" d="M8 45c0-12 5-19 14-19s14 7 14 19H8Z"/>
      <g className="piece-detail">{details[index % details.length]}</g>
    </svg>
  </span>
}
