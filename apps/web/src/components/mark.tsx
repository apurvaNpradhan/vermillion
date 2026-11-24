/** The Sigil mark (docs/design/sigil/mark.svg). `ember` adds the brand dot; use it at 48px and up. */
export function Mark({ size, ember }: { size: number; ember: boolean }) {
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M22.4 6.8 L25.6 6.8 L25.2 42.5 L22.8 42.5 Z" />
      <path d="M24 5 L37.2 14.6 L35.6 16.6 L24 8.2 L12.4 16.6 L10.8 14.6 Z" />
      <path d="M15.2 27.1 L32.8 27.1 L32.2 29.6 L15.8 29.6 Z" />
      {ember ? <circle className="mark-ember" cx="36.5" cy="37" r="3.6" /> : null}
    </svg>
  );
}
