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
  free: ['thinkingmachines/inkling-small', 'z-ai/glm-5.3-flash', 'google/gemini-3.5-flash-lite'],
  memory: ['meta/muse-spark-1.2-contributor', 'deepseek/deepseek-v4-flash-vision-exp', 'qwen/qwen3.8-flash'],
  studio: ['openai/gpt-5.6-luna', 'x-ai/grok-build-0.1', 'anthropic/claude-sonnet-4.6:batch'],
}

export function modelRoute(tier: AiTier) {
  return [...TIER_MODELS[tier]]
}

export const monthlyRequestAllowance: Record<AiTier, number> = { free: 3, memory: 30, studio: 150 }
