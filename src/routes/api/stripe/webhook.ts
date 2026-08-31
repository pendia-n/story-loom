import { createFileRoute } from '@tanstack/react-router'
import { getDatabase, json } from '../../../lib/server/auth'
import { verifyStripeSignature } from '../../../lib/server/stripe'

export const Route = createFileRoute('/api/stripe/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.text()
        const signature = request.headers.get('stripe-signature') ?? ''
        if (!(await verifyStripeSignature(payload, signature))) return json({ error: 'Invalid webhook signature.' }, { status: 400 })
        const event = JSON.parse(payload) as { id: string; type: string; data: { object: Record<string, unknown> } }
        const db = getDatabase()
        const inserted = await db.prepare('INSERT OR IGNORE INTO stripe_events (event_id, event_type, received_at) VALUES (?1, ?2, ?3)')
          .bind(event.id, event.type, Math.floor(Date.now() / 1000)).run()
        if (!inserted.meta.changes) return json({ received: true })
        const object = event.data.object
        if (event.type === 'checkout.session.completed') {
          const userId = String(object.client_reference_id ?? (object.metadata as Record<string, unknown> | undefined)?.user_id ?? '')
          const product = String((object.metadata as Record<string, unknown> | undefined)?.product_code ?? '')
          if (userId && product) {
            if (object.mode === 'subscription') {
              await db.prepare('INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, NULL, ?6) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id, tier = excluded.tier, status = excluded.status, updated_at = excluded.updated_at')
                .bind(userId, String(object.customer ?? ''), String(object.subscription ?? ''), product, 'active', Math.floor(Date.now() / 1000)).run()
            } else {
              await db.prepare('INSERT OR IGNORE INTO purchases (id, user_id, stripe_session_id, product_code, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
                .bind(crypto.randomUUID(), userId, String(object.id), product, 'paid', Math.floor(Date.now() / 1000)).run()
            }
          }
        }
        if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
          const metadata = object.metadata as Record<string, unknown> | undefined
          const userId = String(metadata?.user_id ?? '')
          if (userId) {
            const status = event.type === 'customer.subscription.deleted' ? 'canceled' : String(object.status ?? 'unknown')
            const tier = event.type === 'customer.subscription.deleted' ? 'free' : String(metadata?.tier ?? 'memory')
            await db.prepare('INSERT INTO subscriptions (user_id, stripe_customer_id, stripe_subscription_id, tier, status, current_period_end, cancel_at_period_end, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id = excluded.stripe_customer_id, stripe_subscription_id = excluded.stripe_subscription_id, tier = excluded.tier, status = excluded.status, current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end, updated_at = excluded.updated_at')
              .bind(userId, String(object.customer ?? ''), String(object.id), tier, status, Number(object.current_period_end ?? 0) || null, object.cancel_at_period_end ? 1 : 0, Math.floor(Date.now() / 1000)).run()
          }
        }
        return json({ received: true })
      },
    },
  },
})
