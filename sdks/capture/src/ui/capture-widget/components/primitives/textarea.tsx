import { cn } from "./cn"

export function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
): React.JSX.Element {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60 disabled:cursor-not-allowed disabled:opacity-50",
        props.className
      )}
    />
  )
}
