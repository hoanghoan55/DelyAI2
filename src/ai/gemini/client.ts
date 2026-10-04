export type GeminiJsonRequest = { prompt: string; responseSchema: Record<string, unknown>; model?: string }
export type GeminiEnv = { apiKey?: string; model?: string; fetchImpl?: typeof fetch }

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-3.8-flash' // plan-time confirmed; GEMINI_MODEL overrides

// Round-robin position over GEMINI_API_KEYS — advances only when the pool branch
// is used; explicit env.apiKey and single GEMINI_API_KEY leave it untouched.
let rotationCounter = 0
export function resetGeminiKeyRotation(): void {
  rotationCounter = 0
}

function resolveApiKey(env: GeminiEnv): string {
  if (env.apiKey) return env.apiKey
  const multi = process.env.GEMINI_API_KEYS
  if (multi) {
    const pool = multi.split(',').map((k) => k.trim()).filter(Boolean)
    if (pool.length > 0) {
      const key = pool[rotationCounter % pool.length]!
      rotationCounter++
      return key
    }
  }
  const single = process.env.GEMINI_API_KEY
  if (single) return single
  throw new Error('GEMINI_API_KEY is not set (put it in .env — never in code)')
}

export async function geminiGenerateJson(request: GeminiJsonRequest, env: GeminiEnv = {}): Promise<unknown> {
  const apiKey = resolveApiKey(env)
  const model = (env.model ?? process.env.GEMINI_MODEL) || DEFAULT_MODEL
  const fetchImpl = env.fetchImpl ?? fetch

  const res = await fetchImpl(`${API_ROOT}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: request.responseSchema },
    }),
  })
  if (!res.ok) throw new Error(`GEMINI_HTTP_${res.status}: ${(await res.text()).slice(0, 300)}`)

  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('GEMINI_NO_CANDIDATE: no text part in candidates[0]')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`GEMINI_BAD_JSON: ${text.slice(0, 200)}`)
  }
}
