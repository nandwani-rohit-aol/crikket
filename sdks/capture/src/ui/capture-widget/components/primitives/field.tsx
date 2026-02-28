import { cn } from "./cn"

export function Field(
  props: React.HTMLAttributes<HTMLDivElement>
): React.JSX.Element {
  return (
    <div {...props} className={cn("grid gap-2", props.className)}>
      {props.children}
    </div>
  )
}

export function FieldError(props: {
  errors: unknown[]
}): React.JSX.Element | null {
  const firstError = props.errors[0]
  if (typeof firstError !== "string" || firstError.length === 0) {
    return null
  }

  return <p className="m-0 text-destructive text-xs">{firstError}</p>
}
