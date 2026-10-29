const elevatedClassName = 'shadow-[0_2px_4px_rgba(46,52,39,0.03),0_6px_16px_rgba(46,52,39,0.05)] transition-[translate,box-shadow] duration-200 ease-out hover:shadow-[0_4px_8px_rgba(46,52,39,0.05),0_14px_28px_rgba(46,52,39,0.09)] motion-safe:hover:-translate-y-1 dark:shadow-[0_2px_4px_rgba(0,0,0,0.2),0_6px_16px_rgba(0,0,0,0.3)] dark:hover:shadow-[0_4px_8px_rgba(0,0,0,0.25),0_14px_28px_rgba(0,0,0,0.45)] motion-reduce:transition-none'

const Card = ({ children, className = '', elevated = false }) => {
  return (
    <div className={`rounded-xl border border-line bg-card p-8 ${elevated ? elevatedClassName : ''} ${className}`}>
      {children}
    </div>
  )
}

export default Card
