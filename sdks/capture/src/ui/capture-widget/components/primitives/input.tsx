import { cn } from "./cn"

export function Input(
  props: React.InputHTMLAttributes<HTMLInputElement>
): React.JSX.Element {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    />
  )
}
