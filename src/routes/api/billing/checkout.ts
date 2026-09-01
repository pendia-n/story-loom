import { createFileRoute } from '@tanstack/react-router'
import { createStripeCheckout, productMode, type CheckoutProduct } from '../../../lib/server/stripe'
import { getCurrentUser, getDatabase, json, requireCsrf } from '../../../lib/server/auth'

const products = new Set<CheckoutProduct>(['memory', 'studio', 'golden-hour', 'rain-window', 'stardust-ceiling', 'premiere-night', 'keepsake-export'])

export const Route = createFileRoute('/api/billing/checkout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in before opening checkout.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { product?: string; chapterId?: string }
        if (!body.product || !products.has(body.product as CheckoutProduct)) return json({ error: 'That product is not available.' }, { status: 400 })
        try {
          const product = body.product as CheckoutProduct
          const mode = productMode(product)
          if (mode === 'payment') {
            const chapter = await getDatabase().prepare('SELECT id FROM chapters WHERE id = ?1 AND owner_id = ?2').bind(body.chapterId ?? '', user.id).first()
            if (!chapter) return json({ error: 'Open one of your chapters before buying a permanent finish.' }, { status: 400 })
          }
          return json({ ...(await createStripeCheckout(product, user.id, request, mode === 'payment' ? body.chapterId : undefined)), mode })
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : 'Checkout is not configured.' }, { status: 503 })
        }
      },
    },
  },
})
