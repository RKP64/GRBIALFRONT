import { useEffect, useRef, useState } from 'react'
import { api } from './api'

/**
 * Live job telemetry.
 * EventSource cannot send custom headers, so the stream is consumed with fetch
 * + a ReadableStream reader — which also gives us clean cancellation.
 */
export function useJobStream(jobId) {
  const [job, setJob] = useState(null)
  const [events, setEvents] = useState([])
  const abortRef = useRef(null)

  useEffect(() => {
    if (!jobId) { setJob(null); setEvents([]); return }
    const controller = new AbortController()
    abortRef.current = controller
    let cancelled = false

    ;(async () => {
      try {
        const res = await fetch(api.streamUrl(jobId), {
          headers: { 'X-API-Key': api.apiKey },
          signal: controller.signal,
        })
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() || ''
          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            const payload = JSON.parse(line.slice(5).trim())
            if (payload.job) setJob(payload.job)
            if (payload.type === 'snapshot' && payload.events) setEvents(payload.events)
            if (payload.event) setEvents((prev) => [...prev.slice(-199), payload.event])
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') console.error('Stream error', err)
      }
    })()

    return () => { cancelled = true; controller.abort() }
  }, [jobId])

  return { job, events }
}
