import { getDatabase } from './auth'

export type ProductTier = 'free' | 'memory' | 'studio'

export const PRODUCT_LIMITS: Record<ProductTier, { chapters: number; imagesPerChapter: number; videosPerChapter: number }> = {
  free: { chapters: 1, imagesPerChapter: 12, videosPerChapter: 1 },
  memory: { chapters: 12, imagesPerChapter: 60, videosPerChapter: 3 },
  studio: { chapters: 50, imagesPerChapter: 120, videosPerChapter: 8 },
}

export async function getUserTier(userId: string): Promise<ProductTier> {
  const row = await getDatabase().prepare("SELECT tier FROM subscriptions WHERE user_id = ?1 AND status IN ('active', 'trialing') ORDER BY updated_at DESC LIMIT 1").bind(userId).first<{ tier: string }>()
  return row?.tier === 'memory' || row?.tier === 'studio' ? row.tier : 'free'
}
