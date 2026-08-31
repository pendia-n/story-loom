import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, getRuntimeEnv, json, requireCsrf } from '../../../lib/server/auth'

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string }
}

export const Route = createFileRoute('/api/ai/chapter')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const env = getRuntimeEnv()
        if (!env.OPENROUTER_API_KEY) return json({ error: 'The quiet editor is not configured yet.' }, { status: 503 })
        const body = await request.json() as { chapterId?: string; instruction?: string; shareWithProvider?: boolean }
        if (!body.shareWithProvider) return json({ error: 'Confirm that this prompt may be sent to the external editor.' }, { status: 400 })
        const chapterId = body.chapterId ?? ''
        const chapter = await getDatabase().prepare('SELECT id FROM chapters WHERE id = ?1 AND owner_id = ?2').bind(chapterId, user.id).first()
        if (!chapter) return json({ error: 'Chapter not found.' }, { status: 404 })
        const instruction = body.instruction?.trim().slice(0, 800)
        if (!instruction) return json({ error: 'Write a small request for the editor.' }, { status: 400 })
        const model = env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            ...(env.APP_URL ? { 'HTTP-Referer': env.APP_URL } : {}),
            'X-OpenRouter-Title': 'Story Loom',
          },
          body: JSON.stringify({
            model,
            temperature: 0.7,
            max_tokens: 220,
            messages: [
              { role: 'system', content: 'You are a restrained creative editor. Return a short editable suggestion. Never claim to know the user, never write as if you witnessed their memories, and do not mention AI.' },
              { role: 'user', content: instruction },
            ],
          }),
        })
        const result = await response.json() as OpenRouterResponse
        if (!response.ok) return json({ error: result.error?.message || 'The quiet editor could not finish.' }, { status: 502 })
        const text = result.choices?.[0]?.message?.content?.trim()
        if (!text) return json({ error: 'The quiet editor returned no suggestion.' }, { status: 502 })
        await getDatabase().prepare('INSERT INTO ai_jobs (id, user_id, chapter_id, kind, status, model, input_tokens, output_tokens, result_json, created_at, completed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)')
          .bind(crypto.randomUUID(), user.id, chapterId, 'chapter-note', 'completed', model, result.usage?.prompt_tokens ?? null, result.usage?.completion_tokens ?? null, JSON.stringify({ text }), Math.floor(Date.now() / 1000)).run()
        return json({ suggestion: text, model })
      },
    },
  },
})
