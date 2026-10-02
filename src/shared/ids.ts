export function makeId(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(2, '0')}`
}
