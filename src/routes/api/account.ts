import { createFileRoute } from '@tanstack/react-router'
import { appendCookies, clearSessionCookies, getCurrentUser, getDatabase, getMediaBucket, getRuntimeEnv, json, requireCsrf } from '../../lib/server/auth'

export const Route = createFileRoute('/api/account')({
  server: {
    handlers: {
      DELETE: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in before deleting this account.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { confirmUsername?: string }
        if (body.confirmUsername?.trim().toLowerCase() !== user.username) return json({ error: 'Type your exact username to confirm deletion.' }, { status: 400 })
        const db = getDatabase()
        const subscription = await db.prepare("SELECT stripe_subscription_id, status FROM subscriptions WHERE user_id = ?1 AND status IN ('active', 'trialing')").bind(user.id).first<{ stripe_subscription_id: string | null; status: string }>()
        if (subscription?.stripe_subscription_id) {
          const secret = getRuntimeEnv().STRIPE_SECRET_KEY
          if (!secret) return json({ error: 'Your active subscription could not be canceled because billing is unavailable. The account was not deleted.' }, { status: 503 })
          const canceled = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscription.stripe_subscription_id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${secret}` } })
          if (!canceled.ok) return json({ error: 'Stripe did not confirm cancellation. The account was not deleted.' }, { status: 502 })
        }
        const [media, backgrounds] = await Promise.all([
          db.prepare('SELECT object_key FROM media WHERE owner_id = ?1').bind(user.id).all<{ object_key: string }>(),
          db.prepare('SELECT background_object_key FROM chapters WHERE owner_id = ?1 AND background_object_key IS NOT NULL').bind(user.id).all<{ background_object_key: string }>(),
        ])
        const keys = [...media.results.map((item) => item.object_key), ...backgrounds.results.map((item) => item.background_object_key)]
        for (let offset = 0; offset < keys.length; offset += 1000) await getMediaBucket().delete(keys.slice(offset, offset + 1000))
        await db.prepare('DELETE FROM users WHERE id = ?1').bind(user.id).run()
        return appendCookies(json({ ok: true, deletedObjects: keys.length }), request, clearSessionCookies())
      },
    },
  },
})
