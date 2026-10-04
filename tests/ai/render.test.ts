import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { renderVideo } from '@/ai/render'

const RUN_ID = 'run-render-1'
let repoRoot: string, runDir: string
// Built in beforeEach: a module-level const would evaluate `path.join(runDir, …)
// at import time, before `runDir` exists (runDir is assigned per-test).
let base: { runId: string; repoRoot: string; propsPath: string; totalFrames: number; fps: number }

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delyai-render-'))
  runDir = path.join(repoRoot, 'generated', RUN_ID)
  fs.mkdirSync(path.join(runDir, 'voice'), { recursive: true })
  fs.writeFileSync(path.join(runDir, 'voice', 'scene-001.mp3'), 'mp3-bytes')
  fs.writeFileSync(path.join(runDir, 'voice', 'scene-002.mp3'), 'mp3-bytes')
  fs.writeFileSync(path.join(runDir, 'render-props.json'), '{"payload":{}}')
  base = {
    runId: RUN_ID, repoRoot,
    propsPath: path.join(runDir, 'render-props.json'),
    totalFrames: 135, fps: 30,
  }
})
afterEach(() => fs.rmSync(repoRoot, { recursive: true, force: true }))

describe('renderVideo', () => {
  it('copies mp3s into public/ BEFORE exec, spawns remotion with --props, verifies, cleans up (Review Focus 1)', async () => {
    const seen: { copied: boolean; args: string[]; cwd: string } = { copied: false, args: [], cwd: '' }
    const exec = async (command: string, args: string[], options: { cwd: string; shell: boolean }) => {
      // proven copy-before-exec: the public tree must exist while remotion runs
      seen.copied = fs.existsSync(path.join(repoRoot, 'public', 'generated', RUN_ID, 'voice', 'scene-001.mp3'))
      seen.args = args; seen.cwd = options.cwd
      const outRel = args[4]! // DeLyDemo <out> --props <props>
      fs.writeFileSync(path.join(repoRoot, outRel), 'mp4-bytes'.repeat(10))
      return { code: 0, stdout: '', stderr: '' }
    }
    const { videoPath } = await renderVideo({
      ...base, runDir, exec,
      measureOutput: async () => base.totalFrames / base.fps, // 4.5s exact
    })
    expect(seen.copied).toBe(true)                                     // copy precedes spawn
    expect(seen.args).toEqual(['remotion', 'render', 'remotion/index.ts', 'DeLyDemo',
      `generated/${RUN_ID}/video.mp4`, '--props', `generated/${RUN_ID}/render-props.json`])
    expect(seen.cwd).toBe(repoRoot)
    expect(fs.existsSync(videoPath)).toBe(true)
    expect(fs.readFileSync(videoPath, 'utf8')).toContain('mp4-bytes')
    expect(fs.existsSync(path.join(repoRoot, 'public', 'generated', RUN_ID))).toBe(false) // cleaned after
  })

  it('RENDER_FAILED on non-zero exit (stderr tail surfaces)', async () => {
    const exec = async () => ({ code: 1, stdout: '', stderr: 'Cannot find module "x" …tail of error…' })
    await expect(renderVideo({ ...base, runDir, exec, measureOutput: async () => 4.5 }))
      .rejects.toThrow(/RENDER_FAILED[\s\S]*Cannot find module/)
  })

  it('RENDER_NO_OUTPUT when exit 0 but no file appears', async () => {
    const exec = async () => ({ code: 0, stdout: '', stderr: '' })
    await expect(renderVideo({ ...base, runDir, exec })).rejects.toThrow(/RENDER_NO_OUTPUT/)
  })

  it('RENDER_DURATION_MISMATCH when the mp4 length drifts > 0.5s from frames/fps', async () => {
    const exec = async (_c: string, args: string[]) => {
      fs.writeFileSync(path.join(repoRoot, args[4]!), 'mp4')
      return { code: 0, stdout: '', stderr: '' }
    }
    await expect(renderVideo({ ...base, runDir, exec, measureOutput: async () => 9.9 }))
      .rejects.toThrow(/RENDER_DURATION_MISMATCH/)
  })

  it('RENDER_NO_AUDIO refuses to render a voiceless run', async () => {
    fs.rmSync(path.join(runDir, 'voice', 'scene-001.mp3'))
    fs.rmSync(path.join(runDir, 'voice', 'scene-002.mp3'))
    const exec = async () => { throw new Error('exec must not be called') }
    await expect(renderVideo({ ...base, runDir, exec })).rejects.toThrow(/RENDER_NO_AUDIO/)
  })
})
