/**
 * The landing's hand-drawn chart glyphs (docs/DESIGN.md): a tick for on-track,
 * a flag for the weak spot, an empty box for "not looked at". Decorative — the
 * text next to a mark always carries its meaning.
 */
export function ChartMark({
  kind,
  className = 'size-5',
}: {
  kind: 'tick' | 'flag' | 'open';
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      data-mark={kind}
    >
      {kind === 'tick' && (
        <path
          d="M3.2 10.6c1.6 1.2 3 2.9 4.2 4.9 2.3-4.9 5.4-8.8 9.6-11.6"
          fill="none"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-on-track"
        />
      )}
      {kind === 'flag' && (
        <>
          <path
            d="M5.2 18.2 5 2.6"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="stroke-flag"
          />
          <path
            d="M5.4 3.2c2.8-1 4.9 1.1 7.6.3l3.6-.6-1.9 3.8 2 3.6c-2.8.6-5.2-1.2-8-.4l-3.3.6Z"
            className="fill-flag"
          />
        </>
      )}
      {kind === 'open' && (
        <path
          d="M4.4 4.6c3.8-.5 7.4-.4 11.2.1.4 3.6.3 7.2-.2 10.8-3.6.4-7.3.4-10.9-.1-.5-3.6-.5-7.2-.1-10.8Z"
          fill="none"
          strokeWidth="1.4"
          strokeLinejoin="round"
          className="stroke-ink-muted"
        />
      )}
    </svg>
  );
}
