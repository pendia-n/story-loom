import { getDatabase } from './auth'

export type ProductTier = 'free' | 'memory' | 'studio'

export const PRODUCT_LIMITS: Record<ProductTier, { chapters: number; imagesPerChapter: number; videosPerChapter: number }> = {
  free: { chapters: 1, imagesPerChapter: 12, videosPerChapter: 1 },
  memory: { chapters: 12, imagesPerChapter: 60, videosPerChapter: 3 },
  studio: { chapters: 50, imagesPerChapter: 120, videosPerChapter: 8 },
}

export const BACKGROUND_MODES = ['morning', 'night', 'twilight', 'afternoon', 'sunrise'] as const
export type BackgroundMode = typeof BACKGROUND_MODES[number]

export async function getPurchasedCount(userId: string, productCode: string) {
  const row = await getDatabase().prepare(
    "SELECT COUNT(*) AS count FROM purchases WHERE user_id = ?1 AND product_code = ?2 AND status = 'paid'",
  ).bind(userId, productCode).first<{ count: number }>()
  return row?.count ?? 0
}

export async function getUserLimits(userId: string, tier?: ProductTier) {
  const resolvedTier = tier ?? await getUserTier(userId)
  const base = PRODUCT_LIMITS[resolvedTier]
  if (resolvedTier !== 'studio') return base
  const [chapters, images, videos] = await Promise.all([
    getPurchasedCount(userId, 'studio-chapter'),
    getPurchasedCount(userId, 'studio-images-50'),
    getPurchasedCount(userId, 'studio-videos-15'),
  ])
  return {
    chapters: base.chapters + chapters,
    imagesPerChapter: base.imagesPerChapter + images * 50,
    videosPerChapter: base.videosPerChapter + videos * 15,
  }
}

export async function getUserTier(userId: string): Promise<ProductTier> {
  const row = await getDatabase().prepare("SELECT tier FROM subscriptions WHERE user_id = ?1 AND status IN ('active', 'trialing') ORDER BY updated_at DESC LIMIT 1").bind(userId).first<{ tier: string }>()
  return row?.tier === 'memory' || row?.tier === 'studio' ? row.tier : 'free'
}
