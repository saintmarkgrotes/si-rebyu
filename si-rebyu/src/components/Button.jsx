export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  loading = false,
  disabled = false,
  className = '',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

  const variants = {
    primary: 'bg-ink text-paper hover:bg-neutral-800',
    secondary: 'bg-paper text-ink border border-ink hover:bg-neutral-100',
    ghost: 'text-ink hover:bg-neutral-100',
  }

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${className}`}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}
