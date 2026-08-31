import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, json } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/billing/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        const subscription = await getDatabase().prepare('SELECT tier, status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ?1').bind(user.id).first()
        const purchases = await getDatabase().prepare('SELECT product_code, created_at FROM purchases WHERE user_id = ?1 ORDER BY created_at DESC').bind(user.id).all()
        return json({ subscription: subscription ?? { tier: 'free', status: 'inactive' }, purchases: purchases.results })
      },
    },
  },
})
