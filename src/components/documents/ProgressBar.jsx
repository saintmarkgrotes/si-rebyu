// A thin bar. Progress is always also stated in words next to it, so meaning never depends on the bar alone.
const ProgressBar = ({ percent, label }) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={percent}
    className="h-1.5 w-full overflow-hidden rounded-full bg-line"
  >
    <div
      className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
      style={{ width: `${percent}%` }}
    />
  </div>
)

export default ProgressBar
