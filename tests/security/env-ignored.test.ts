import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const repoRoot = process.cwd()

describe('secret and artifact hygiene', () => {
  it('.gitignore covers .env, generated/, public/generated/', () => {
    const ig = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8')
    for (const entry of ['.env', 'generated/', 'public/generated/']) {
      expect(ig).toContain(entry)
    }
  })

  it('git agrees the sensitive paths are ignored', () => {
    for (const p of ['.env', 'generated/run-x/video.mp4', 'public/generated/run-x/voice/scene-001.mp3']) {
      expect(() => execFileSync('git', ['check-ignore', '-q', p], { cwd: repoRoot })).not.toThrow()
    }
  })

  it('no .env or generated artifact is tracked', () => {
    const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' })
    expect(tracked).not.toMatch(/(^|\/)\.env$/m)
    expect(tracked).not.toMatch(/^generated\//m)
    expect(tracked).not.toMatch(/^public\/generated\//m)
  })

  it('.env.example names keys but carries no values', () => {
    const example = fs.readFileSync(path.join(repoRoot, '.env.example'), 'utf8')
    for (const line of example.split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))) {
      expect(line.split('=').slice(1).join('=')).toBe('')
    }
  })
})
