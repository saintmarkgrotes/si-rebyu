import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { buttonVariants } from './buttonVariants'
import { cn } from "cn"


function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button }
