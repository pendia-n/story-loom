import { createFileRoute } from '@tanstack/react-router'
import { json, makeTotpSecret, makeTotpUri, requireSameOrigin } from '../../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/register/totp-setup')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireSameOrigin(request)) return json({ error: 'Invalid request origin.' }, { status: 403 })
        const body = await request.json() as { username?: string }
        const username = body.username?.trim().toLowerCase() ?? ''
        if (!/^[a-z0-9_]{3,24}$/.test(username)) {
          return json({ error: 'Enter a valid username before preparing TOTP.' }, { status: 400 })
        }
        const secret = makeTotpSecret()
        return json({ secret, uri: makeTotpUri(username, secret) })
      },
    },
  },
})
