import { createFileRoute } from '@tanstack/react-router'
import { createStripeCheckout, productMode } from '../../../lib/server/stripe'
import { getCurrentUser, json, requireCsrf } from '../../../lib/server/auth'

const products = new Set(['memory', 'studio', 'golden-hour'])

export const Route = createFileRoute('/api/billing/checkout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in before opening checkout.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { product?: string }
        if (!body.product || !products.has(body.product)) return json({ error: 'That product is not available.' }, { status: 400 })
        try {
          const product = body.product as 'memory' | 'studio' | 'golden-hour'
          return json({ ...(await createStripeCheckout(product, user.id, request)), mode: productMode(product) })
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : 'Checkout is not configured.' }, { status: 503 })
        }
      },
    },
  },
})
