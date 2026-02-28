import { cn } from "./cn"

export function Label(
  props: React.LabelHTMLAttributes<HTMLLabelElement>
): React.JSX.Element {
  return (
    <label
      {...props}
      className={cn("font-medium text-sm leading-none", props.className)}
    >
      {props.children}
    </label>
  )
}
