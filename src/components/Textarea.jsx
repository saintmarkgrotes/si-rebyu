const Textarea = ({ label, id, error, className = '', ...props }) => (
  <div className="flex flex-col gap-1.5">
    {label && (
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
    )}
    <textarea
      id={id}
      rows={3}
      className={`w-full resize-y rounded-md border bg-card px-3 py-2.5 text-sm text-ink placeholder:text-muted-foreground
        focus:outline-none focus-visible:outline-2 focus-visible:outline-ring
        ${error ? 'border-danger' : 'border-input'} ${className}`}
      {...props}
    />
    {error && <p className="text-sm text-danger">{error}</p>}
  </div>
)

export default Textarea