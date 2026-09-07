import { createFileRoute } from '@tanstack/react-router'
import { getDatabase, json } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/username')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const username = new URL(request.url).searchParams.get('username')?.trim().toLowerCase() ?? ''
        if (!/^[a-z0-9_]{3,24}$/.test(username)) {
          return json({ available: false, valid: false, message: 'Use 3–24 lowercase letters, numbers, or underscores.' })
        }
        const existing = await getDatabase().prepare('SELECT 1 FROM users WHERE username = ?1 LIMIT 1').bind(username).first()
        return json({ available: !existing, valid: true, message: existing ? 'That username is already taken.' : 'That username is available.' })
      },
    },
  },
})
