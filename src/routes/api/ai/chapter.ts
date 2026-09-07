import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, getMediaBucket, getRuntimeEnv, json, requireCsrf } from '../../../lib/server/auth'
import { AI_CATALOG, modelRoute, monthlyAllowanceWithAddons, type AiKind, type AiTier } from '../../../lib/server/ai-catalog'

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>
  model?: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  error?: { message?: string }
}

const IMAGE_KINDS = new Set<AiKind>(['mood-palette', 'scene-ordering', 'cover-choice', 'chapter-narration', 'alt-text', 'future-postcard'])
const MAX_SHARED_IMAGES = 8
const MAX_SHARED_BYTES = 12 * 1024 * 1024

function base64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
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
        const body = await request.json() as { chapterId?: string; instruction?: string; kind?: AiKind; mediaIds?: string[]; shareWithProvider?: boolean }
        if (!body.shareWithProvider) return json({ error: 'Confirm that this prompt may be sent to the external editor.' }, { status: 400 })
        const chapterId = body.chapterId ?? ''
        const chapter = await getDatabase().prepare('SELECT id FROM chapters WHERE id = ?1 AND owner_id = ?2').bind(chapterId, user.id).first()
        if (!chapter) return json({ error: 'Chapter not found.' }, { status: 404 })
        const instruction = body.instruction?.trim().slice(0, 800)
        if (!instruction) return json({ error: 'Write a small request for the editor.' }, { status: 400 })
        const kind = body.kind && AI_CATALOG[body.kind] ? body.kind : 'caption-polish'
        const job = AI_CATALOG[kind]
        const requestedMediaIds = IMAGE_KINDS.has(kind) ? [...new Set(body.mediaIds ?? [])] : []
        if (requestedMediaIds.length > MAX_SHARED_IMAGES || requestedMediaIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
          return json({ error: `Choose up to ${MAX_SHARED_IMAGES} chapter images.` }, { status: 400 })
        }
        if (IMAGE_KINDS.has(kind) && requestedMediaIds.length === 0) return json({ error: 'Choose at least one image for this editor action.' }, { status: 400 })
        const imageParts: Array<{ type: 'image_url'; image_url: { url: string } }> = []
        const imageLabels: string[] = []
        if (requestedMediaIds.length) {
          const placeholders = requestedMediaIds.map((_, index) => `?${index + 3}`).join(', ')
          const media = await getDatabase().prepare(
            `SELECT id, object_key, filename, content_type, byte_size FROM media WHERE owner_id = ?1 AND chapter_id = ?2 AND id IN (${placeholders})`,
          ).bind(user.id, chapterId, ...requestedMediaIds).all<{ id: string; object_key: string; filename: string; content_type: string; byte_size: number }>()
          const byId = new Map(media.results.map((item) => [item.id, item]))
          if (byId.size !== requestedMediaIds.length) return json({ error: 'One selected memory is unavailable.' }, { status: 404 })
          let totalBytes = 0
          for (const id of requestedMediaIds) {
            const item = byId.get(id)!
            if (!['image/png', 'image/webp', 'image/gif'].includes(item.content_type)) return json({ error: 'Quiet Editor image actions do not send MP4 files.' }, { status: 400 })
            totalBytes += item.byte_size
            if (totalBytes > MAX_SHARED_BYTES) return json({ error: 'Selected images exceed the 12 MB editor sharing limit.' }, { status: 400 })
            const object = await getMediaBucket().get(item.object_key)
            if (!object) return json({ error: 'One selected image is unavailable.' }, { status: 404 })
            const bytes = new Uint8Array(await object.arrayBuffer())
            imageLabels.push(`${imageLabels.length + 1}. ${item.filename}`)
            imageParts.push({ type: 'image_url', image_url: { url: `data:${item.content_type};base64,${base64(bytes)}` } })
          }
        }
        const subscription = await getDatabase().prepare("SELECT tier FROM subscriptions WHERE user_id = ?1 AND status IN ('active', 'trialing')").bind(user.id).first<{ tier: AiTier }>()
        const tier: AiTier = subscription?.tier || 'free'
        const monthStart = Math.floor(new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).getTime() / 1000)
        const used = await getDatabase().prepare("SELECT COUNT(*) AS requests FROM ai_jobs WHERE user_id = ?1 AND status = 'completed' AND created_at >= ?2").bind(user.id, monthStart).first<{ requests: number }>()
        const allowance = await monthlyAllowanceWithAddons(getDatabase(), user.id, tier)
        if ((used?.requests || 0) >= allowance) return json({ error: 'Your included Quiet Editor requests are used for this month.', tier, used: used?.requests || 0, allowance }, { status: 402 })
        const models = modelRoute(tier)
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            ...(env.APP_URL ? { 'HTTP-Referer': env.APP_URL } : {}),
            'X-OpenRouter-Title': 'Story Loom',
          },
          body: JSON.stringify({
            models,
            provider: { data_collection: 'deny', allow_fallbacks: true },
            temperature: 0.7,
            max_tokens: job.maxTokens,
            messages: [
              { role: 'system', content: `You are Story Loom's restrained Quiet Editor. ${job.system} Never claim to know the user, never write as if you witnessed their memories, and do not mention AI.` },
              { role: 'user', content: imageParts.length ? [{ type: 'text', text: `${instruction}\n\nImages in current chapter order:\n${imageLabels.join('\n')}` }, ...imageParts] : instruction },
            ],
          }),
        })
        const result = await response.json() as OpenRouterResponse
        if (!response.ok) return json({ error: result.error?.message || 'The quiet editor could not finish.' }, { status: 502 })
        const text = result.choices?.[0]?.message?.content?.trim()
        if (!text) return json({ error: 'The quiet editor returned no suggestion.' }, { status: 502 })
        const resolvedModel = result.model || models[0]
        await getDatabase().prepare('INSERT INTO ai_jobs (id, user_id, chapter_id, kind, status, model, input_tokens, output_tokens, result_json, created_at, completed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)')
          .bind(crypto.randomUUID(), user.id, chapterId, kind, 'completed', resolvedModel, result.usage?.prompt_tokens ?? null, result.usage?.completion_tokens ?? null, JSON.stringify({ text, cost: result.usage?.cost ?? null, tier }), Math.floor(Date.now() / 1000)).run()
        return json({ suggestion: text, model: resolvedModel, tier, requestsUsed: (used?.requests || 0) + 1, allowance, cost: result.usage?.cost ?? null })
      },
    },
  },
})
