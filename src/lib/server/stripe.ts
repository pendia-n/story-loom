import { getRuntimeEnv } from './auth'

export type CheckoutProduct = 'memory' | 'studio' | 'golden-hour' | 'rain-window' | 'stardust-ceiling' | 'premiere-night' | 'keepsake-export'

const productEnv: Record<CheckoutProduct, keyof ReturnType<typeof getRuntimeEnv>> = {
  memory: 'STRIPE_PRICE_MEMORY',
  studio: 'STRIPE_PRICE_STUDIO',
  'golden-hour': 'STRIPE_PRICE_GOLDEN_HOUR',
  'rain-window': 'STRIPE_PRICE_RAIN_WINDOW',
  'stardust-ceiling': 'STRIPE_PRICE_STARDUST_CEILING',
  'premiere-night': 'STRIPE_PRICE_PREMIERE_NIGHT',
  'keepsake-export': 'STRIPE_PRICE_KEEPSAKE_EXPORT',
}

export function productMode(product: CheckoutProduct) {
  return product === 'memory' || product === 'studio' ? 'subscription' : 'payment'
}

export async function createStripeCheckout(product: CheckoutProduct, userId: string, request: Request, chapterId?: string) {
  const env = getRuntimeEnv()
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured')
  const price = String(env[productEnv[product]] ?? '')
  if (!price) throw new Error(`Stripe price is not configured for ${product}`)
  const base = env.APP_URL || new URL(request.url).origin
  const fields = new URLSearchParams()
  fields.set('mode', productMode(product))
  fields.set('line_items[0][price]', price)
  fields.set('line_items[0][quantity]', '1')
  fields.set('client_reference_id', userId)
  fields.set('metadata[user_id]', userId)
  fields.set('metadata[product_code]', product)
  if (chapterId) fields.set('metadata[chapter_id]', chapterId)
  fields.set('success_url', `${base}/billing/success?session_id={CHECKOUT_SESSION_ID}`)
  fields.set('cancel_url', `${base}/pricing`)
  fields.set('integration_identifier', `story_loom_${crypto.randomUUID().slice(0, 8)}`)
  if (productMode(product) === 'subscription') {
    fields.set('subscription_data[metadata][user_id]', userId)
    fields.set('subscription_data[metadata][tier]', product)
  }
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: fields,
  })
  const result = await response.json() as { id?: string; url?: string; error?: { message?: string } }
  if (!response.ok || !result.url) throw new Error(result.error?.message || 'Stripe checkout could not be created')
  return { id: result.id, url: result.url }
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function constantTimeHexEqual(left: string, right: string) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

export async function verifyStripeSignature(payload: string, header: string) {
  const secret = getRuntimeEnv().STRIPE_WEBHOOK_SECRET
  if (!secret) return false
  const timestamp = header.split(',').find((part) => part.startsWith('t='))?.slice(2)
  const signatures = header.split(',').filter((part) => part.startsWith('v1=')).map((part) => part.slice(3))
  if (!timestamp || signatures.length === 0 || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret) as unknown as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const expected = hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`) as unknown as BufferSource)))
  return signatures.some((signature) => constantTimeHexEqual(signature, expected))
}
