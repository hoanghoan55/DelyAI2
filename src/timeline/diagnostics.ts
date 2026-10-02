export type DiagnosticSeverity = 'error' | 'warning' | 'info'
export type Diagnostic = {
  severity: DiagnosticSeverity
  code: string
  message: string
  sceneId?: string
  layerId?: string
}
