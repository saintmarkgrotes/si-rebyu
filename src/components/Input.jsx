export default function Input({ label, id, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
      )}
      <input
        id={id}
        className={`w-full rounded-md border px-3 py-2.5 text-sm text-ink placeholder:text-muted
          focus:outline-none focus-visible:outline-2 focus-visible:outline-ink
          ${error ? 'border-danger' : 'border-line'} ${className}`}
        {...props}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}
