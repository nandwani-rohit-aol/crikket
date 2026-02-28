import {
  PRIORITY_OPTIONS,
  type Priority,
} from "@crikket/shared/constants/priorities"
import type { CaptureSubmissionDraft } from "../../../types"

const priorityValues = new Set<string>(Object.values(PRIORITY_OPTIONS))

export const capturePriorityOptions = [
  { label: "Critical", value: PRIORITY_OPTIONS.critical },
  { label: "High", value: PRIORITY_OPTIONS.high },
  { label: "Medium", value: PRIORITY_OPTIONS.medium },
  { label: "Low", value: PRIORITY_OPTIONS.low },
  { label: "None", value: PRIORITY_OPTIONS.none },
] as const

export function validateReviewDraft(
  value: CaptureSubmissionDraft
): Partial<Record<keyof CaptureSubmissionDraft, string>> | undefined {
  const errors: Partial<Record<keyof CaptureSubmissionDraft, string>> = {}

  if (value.title.length > 200) {
    errors.title = "Title must be at most 200 characters."
  }

  if (value.description.length > 3000) {
    errors.description = "Description must be at most 3000 characters."
  }

  if (!priorityValues.has(value.priority)) {
    errors.priority = "Select a valid priority."
  }

  return Object.keys(errors).length > 0 ? errors : undefined
}

export type CapturePriority = Priority
