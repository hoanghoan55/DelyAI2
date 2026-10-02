import { ProjectDSLSchema } from '@/video-engine/schema'
import type { Diagnostic } from '@/timeline/diagnostics'

/**
 * Layer 1 — schema. Pure validation; never repairs or coerces input.
 *
 * Reports (does not fix): every Zod issue becomes one `SCHEMA_INVALID` error
 * whose message carries the offending path. Total — `safeParse` never throws.
 */
export function checkSchema(value: unknown): Diagnostic[] {
  const result = ProjectDSLSchema.safeParse(value)
  if (result.success) return []
  return result.error.issues.map((issue) => ({
    severity: 'error' as const,
    code: 'SCHEMA_INVALID',
    message: `${issue.path.join('.') || '<root>'}: ${issue.message}`,
  }))
}
