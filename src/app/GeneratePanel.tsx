import React, { useEffect, useRef, useState } from 'react'

type StatusResponse = { stage?: string; status: string; videoUrl?: string; error?: string }

/** Dev-only trigger for the Node-side pipeline; the browser never runs generation (spec §8). */
export const GeneratePanel: React.FC = () => {
  const [topic, setTopic] = useState('')
  const [targetSeconds, setTargetSeconds] = useState(10)
  const [language, setLanguage] = useState('vi')
  const [status, setStatus] = useState('idle')
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  const generate = async () => {
    setError(null); setVideoUrl(null); setStatus('starting')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, targetSeconds, language }),
      })
      const payload = (await res.json()) as { runId?: string; error?: string }
      if (!res.ok || !payload.runId) throw new Error(payload.error ?? `HTTP ${res.status}`)
      setStatus('running')
      timer.current = setInterval(async () => {
        try {
          const state = (await (await fetch(`/api/generate/status?runId=${encodeURIComponent(payload.runId!)}`)).json()) as StatusResponse
          if (state.status === 'done') {
            if (timer.current) clearInterval(timer.current)
            setVideoUrl(state.videoUrl ?? null); setStatus('done')
          } else if (state.status === 'failed') {
            if (timer.current) clearInterval(timer.current)
            setError(state.error ?? 'failed'); setStatus('failed')
          } else setStatus(`running: ${state.stage ?? ''}`)
        } catch { /* transient poll failure — next tick retries */ }
      }, 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('failed')
    }
  }

  const busy = status === 'starting' || status.startsWith('running')
  return (
    <section style={{ marginTop: 32, borderTop: '1px solid #2a3140', paddingTop: 16, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <h2 style={{ fontSize: 18 }}>Generate from brief (dev)</h2>
      <textarea
        value={topic} onChange={(e) => setTopic(e.target.value)} rows={3}
        placeholder="Chủ đề video, ví dụ: Giới thiệu kiến trúc DeLyAI2…"
        style={{ width: '100%', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', margin: '8px 0' }}>
        <label>seconds{' '}
          <input type="number" min={5} max={120} value={targetSeconds}
            onChange={(e) => setTargetSeconds(Number(e.target.value))} style={{ width: 64 }} />
        </label>
        <label>lang{' '}
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="vi">vi</option>
            <option value="en">en</option>
          </select>
        </label>
        <button onClick={generate} disabled={!topic.trim() || busy}>Generate</button>
        <span style={{ opacity: 0.7 }}>{status}{error ? ` — ${error}` : ''}</span>
      </div>
      {videoUrl && <video src={videoUrl} controls style={{ width: '100%' }} />}
    </section>
  )
}
