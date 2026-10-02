export function canonicalize(value: unknown): string {
  return write(value)
}

function write(value: unknown): string {
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number') return writeNumber(value as number)
  if (t === 'boolean') return (value as boolean) ? 'true' : 'false'
  if (t === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(write).join(',') + ']'
  if (t === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + write(obj[k])).join(',') + '}'
  }
  throw new Error(`canonicalize: unsupported type "${t}"`)
}

function writeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error('canonicalize: non-finite number (NaN/Infinity) is not allowed')
  if (Object.is(n, -0)) return '0'
  return String(n) // integers lose their decimal point; floats keep one canonical form
}
