import { parseArgs } from 'node:util'

export type GenerateCliArgs = { brief: string; targetSeconds: number; language: string; runId?: string; voice?: string; resume?: string }

const USAGE = 'Usage: npm run generate:1a -- --brief "<topic>" [--target 30] [--lang vi] [--run-id <id>] [--voice <voiceId>] [--resume <id>]'

export function parseGenerateArgs(argv: string[]): GenerateCliArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      brief: { type: 'string' },
      target: { type: 'string' },
      lang: { type: 'string' },
      'run-id': { type: 'string' },
      voice: { type: 'string' },
      resume: { type: 'string' },
    },
    strict: true,
  })

  const brief = (values.brief ?? '').trim()
  if (!brief) throw new Error(`--brief is required.\n${USAGE}`)

  const targetSeconds = values.target === undefined ? 30 : Number(values.target)
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0) throw new Error(`--target must be a positive number of seconds.\n${USAGE}`)

  return {
    brief,
    targetSeconds,
    language: values.lang ?? 'vi',
    runId: values['run-id'],
    voice: values.voice,
    resume: values.resume,
  }
}
