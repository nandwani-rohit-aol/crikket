import { useForm } from "@tanstack/react-form"
import type { CaptureSubmissionDraft } from "../../../types"
import type { CaptureUiState } from "../../types"
import { MediaPreview } from "../components/media-preview"
import { Button } from "../components/primitives/button"
import { Field, FieldError } from "../components/primitives/field"
import { Input } from "../components/primitives/input"
import { Label } from "../components/primitives/label"
import { Textarea } from "../components/primitives/textarea"
import { SummaryStat } from "../components/summary-stat"
import {
  capturePriorityOptions,
  validateReviewDraft,
} from "../utils/review-form-schema"

interface ReviewFormSectionProps {
  formKey: string
  isSubmitting: boolean
  state: CaptureUiState
  onCancel: () => void
  onSubmit: (draft: CaptureSubmissionDraft) => void
}

export function ReviewFormSection({
  formKey,
  isSubmitting,
  state,
  onCancel,
  onSubmit,
}: ReviewFormSectionProps): React.JSX.Element {
  const form = useForm({
    defaultValues: state.reviewDraft,
    validators: {
      onSubmit: ({ value }) => validateReviewDraft(value),
    },
    onSubmit: ({ value }) => {
      onSubmit({
        title: value.title.trim(),
        description: value.description.trim(),
        priority: value.priority,
      })
    },
  })

  return (
    <section className="grid gap-4 p-5" key={formKey}>
      <div className="overflow-hidden rounded-xl border bg-muted/60">
        <MediaPreview media={state.media} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SummaryStat label="Actions" value={state.summary.actions} />
        <SummaryStat label="Logs" value={state.summary.logs} />
        <SummaryStat label="Network" value={state.summary.networkRequests} />
      </div>

      {state.warnings.length > 0 ? (
        <ul className="m-0 grid gap-1 pl-5 text-muted-foreground text-xs">
          {state.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          form.handleSubmit()
        }}
      >
        <form.Field name="title">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <Label htmlFor={`${formKey}-title`}>Title (Optional)</Label>
                <Input
                  aria-invalid={isInvalid}
                  id={`${formKey}-title`}
                  maxLength={200}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.currentTarget.value)
                  }}
                  placeholder="What went wrong?"
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="description">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <Label htmlFor={`${formKey}-description`}>Description</Label>
                <Textarea
                  aria-invalid={isInvalid}
                  className="min-h-24 resize-y"
                  id={`${formKey}-description`}
                  maxLength={4000}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.currentTarget.value)
                  }}
                  placeholder="Steps to reproduce, expected behavior, and what happened."
                  value={field.state.value}
                />
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="priority">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0

            return (
              <Field data-invalid={isInvalid}>
                <Label htmlFor={`${formKey}-priority`}>Priority</Label>
                <select
                  aria-invalid={isInvalid}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/60"
                  id={`${formKey}-priority`}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(
                      event.currentTarget
                        .value as CaptureSubmissionDraft["priority"]
                    )
                  }}
                  value={field.state.value}
                >
                  {capturePriorityOptions.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </select>
                {isInvalid ? (
                  <FieldError errors={field.state.meta.errors} />
                ) : null}
              </Field>
            )
          }}
        </form.Field>

        <div className="grid grid-cols-2 gap-2">
          <Button
            className="w-full"
            disabled={state.busy || isSubmitting || form.state.isSubmitting}
            type="submit"
          >
            Submit Report
          </Button>
          <Button
            className="w-full"
            disabled={state.busy || isSubmitting || form.state.isSubmitting}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            Start Over
          </Button>
        </div>
      </form>
    </section>
  )
}
