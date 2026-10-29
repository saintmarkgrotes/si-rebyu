export default function BrandLogo({ compact = false }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-accent-strong">
      <img
        src="/brand/simang-mark.svg"
        alt=""
        aria-hidden="true"
        width="40"
        height="40"
        className={compact ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-12 w-12'}
      />
      <span className={compact ? 'sr-only text-sm font-semibold sm:not-sr-only' : 'text-2xl font-semibold tracking-tight'}>
        si-rebyu
      </span>
    </span>
  )
}
