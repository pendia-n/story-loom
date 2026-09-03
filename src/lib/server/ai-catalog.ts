export type AiTier = 'free' | 'memory' | 'studio'
export type AiKind = 'title-polish' | 'caption-polish' | 'memory-thread' | 'mood-palette' | 'scene-ordering' | 'cover-choice' | 'chapter-narration' | 'alt-text' | 'future-postcard'
type Profile = 'text' | 'vision' | 'layout'

export const AI_CATALOG: Record<AiKind, { profile: Profile; maxTokens: number; system: string }> = {
  'title-polish': { profile: 'text', maxTokens: 80, system: 'Offer three restrained, editable chapter titles.' },
  'caption-polish': { profile: 'text', maxTokens: 120, system: 'Polish the supplied caption without inventing facts.' },
  'memory-thread': { profile: 'text', maxTokens: 220, system: 'Find a concise thematic thread only from supplied text.' },
  'mood-palette': { profile: 'vision', maxTokens: 180, system: 'Describe a visual mood and accessible palette from explicitly shared images.' },
  'scene-ordering': { profile: 'layout', maxTokens: 300, system: 'Return a concise scene order from explicitly shared image descriptions.' },
  'cover-choice': { profile: 'vision', maxTokens: 160, system: 'Rank explicitly shared cover candidates and explain briefly.' },
  'chapter-narration': { profile: 'vision', maxTokens: 420, system: 'Draft an editable chapter narration without claiming personal knowledge.' },
  'alt-text': { profile: 'vision', maxTokens: 140, system: 'Write factual, concise accessibility alt text.' },
  'future-postcard': { profile: 'text', maxTokens: 300, system: 'Draft a hopeful editable postcard without pretending to predict the future.' },
}

export const TIER_MODELS: Record<AiTier, readonly [string, string, string]> = {
  free: ['openai/gpt-4o-mini', 'google/gemini-2.5-flash-lite', 'anthropic/claude-3-haiku'],
  memory: ['google/gemini-2.5-flash', 'qwen/qwen3.5-flash-02-23', 'anthropic/claude-3-haiku'],
  studio: ['openai/gpt-4o', 'google/gemini-2.5-pro', 'anthropic/claude-3-5-haiku'],
}

export function modelRoute(tier: AiTier) {
  return [...TIER_MODELS[tier]]
}

export const monthlyRequestAllowance: Record<AiTier, number> = { free: 3, memory: 30, studio: 150 }

export async function monthlyAllowanceWithAddons(db: D1Database, userId: string, tier: AiTier) {
  if (tier !== 'studio') return monthlyRequestAllowance[tier]
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM purchases WHERE user_id = ?1 AND product_code = 'studio-editor-100' AND status = 'paid'",
  ).bind(userId).first<{ count: number }>()
  return monthlyRequestAllowance[tier] + (row?.count ?? 0) * 100
}
