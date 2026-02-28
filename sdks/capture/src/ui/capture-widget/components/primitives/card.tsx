import { cn } from "./cn"

export function Card(
  props: React.HTMLAttributes<HTMLDivElement>
): React.JSX.Element {
  return (
    <div
      {...props}
      className={cn(
        "rounded-xl border border-border/80 bg-card text-card-foreground shadow-2xl",
        props.className
      )}
    >
      {props.children}
    </div>
  )
}

export function CardHeader(
  props: React.HTMLAttributes<HTMLDivElement>
): React.JSX.Element {
  return (
    <div {...props} className={cn("border-b px-5 py-4", props.className)}>
      {props.children}
    </div>
  )
}

export function CardContent(
  props: React.HTMLAttributes<HTMLDivElement>
): React.JSX.Element {
  return (
    <div {...props} className={props.className}>
      {props.children}
    </div>
  )
}

export function CardTitle(props: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <h2 className={cn("font-semibold text-lg", props.className)}>
      {props.children}
    </h2>
  )
}

export function CardDescription(props: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <p className={cn("m-0 text-muted-foreground text-sm", props.className)}>
      {props.children}
    </p>
  )
}
