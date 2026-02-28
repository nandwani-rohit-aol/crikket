import { cn } from "./cn"

export function Badge(props: {
  children: React.ReactNode
  className?: string
  variant?: "default" | "secondary"
}): React.JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-muted px-2 py-0.5 font-medium text-[11px] text-foreground",
        props.className
      )}
    >
      {props.children}
    </span>
  )
}
