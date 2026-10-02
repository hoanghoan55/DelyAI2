import type { Diagnostic } from '@/timeline/diagnostics'

export class CompilerError extends Error {
  readonly diagnostics: Diagnostic[]
  constructor(message: string, diagnostics: Diagnostic[]) {
    super(message)
    this.name = 'CompilerError'
    this.diagnostics = diagnostics
  }
}
