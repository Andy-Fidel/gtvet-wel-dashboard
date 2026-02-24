import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-12 w-full rounded-full border border-white/30 bg-white/10 px-6 py-2 text-base text-white shadow-sm transition-all placeholder:text-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB800] focus-visible:border-[#FFB800] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm backdrop-blur-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
