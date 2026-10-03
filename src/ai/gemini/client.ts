export type GeminiJsonRequest = { prompt: string; responseSchema: Record<string, unknown>; model?: string }
export type GeminiEnv = { apiKey?: string; model?: string; fetchImpl?: typeof fetch }

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_MODEL = 'gemini-3.8-flash' // plan-time confirmed; GEMINI_MODEL overrides

export async function geminiGenerateJson(request: GeminiJsonRequest, env: GeminiEnv = {}): Promise<unknown> {
  const apiKey = env.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set (put it in .env — never in code)')
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
