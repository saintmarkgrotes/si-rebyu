const Card = ({ children, className = '' }) => {
  return (
    <div className={`rounded-lg border border-line bg-paper p-8 ${className}`}>
      {children}
    </div>
  )
}

export default Card