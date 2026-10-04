// scripts/generate-1a.ts — CLI entry. Lives outside src/ai/**, so it may own
// registration: the compiler needs the registry before generateProject compiles.
import { registerBackends } from '@/video-engine/runtime'
import { parseGenerateArgs } from '@/ai/cli-args'
import { generateProject, StageError } from '@/ai/generate'

registerBackends()

const args = parseGenerateArgs(process.argv.slice(2))

try {
  const result = await generateProject({
    brief: { topic: args.brief, targetSeconds: args.targetSeconds, language: args.language },
    runId: args.runId ?? args.resume,
    voiceId: args.voice,
    onProgress: (e) => console.log(`[${e.status.padEnd(4)}] ${e.stage}${e.detail ? ` — ${e.detail}` : ''}`),
  })
  console.log(`\n✅ video: ${result.videoPath}`)
  console.log(`   runId: ${result.runId}`)
  console.log(`   scenes: ${Object.keys(result.timeline.sceneWindows).length}, frames: ${result.timeline.totalFrames} @ ${result.timeline.fps}fps`)
} catch (err) {
  if (err instanceof StageError) console.error(`\n❌ stage "${err.stage}" failed: ${err.message}`)
  else console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
}
