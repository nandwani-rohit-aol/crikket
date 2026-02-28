import { cn } from "./cn"

type ButtonVariant = "primary" | "outline" | "secondary"
type ButtonSize = "default" | "sm"

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    size?: ButtonSize
    variant?: ButtonVariant
  }
): React.JSX.Element {
  const variant = props.variant ?? "primary"
  const size = props.size ?? "default"

  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm",
        variant === "primary" &&
          "bg-foreground text-background hover:opacity-90",
        variant === "outline" &&
          "border border-input bg-transparent text-foreground hover:bg-muted/80",
        variant === "secondary" && "bg-muted text-foreground",
        props.className
      )}
      type={props.type ?? "button"}
    >
      {props.children}
    </button>
  )
}
