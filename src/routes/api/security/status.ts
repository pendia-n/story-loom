import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, json } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/security/status')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        const row = await getDatabase().prepare('SELECT totp_enabled, security_question_1, security_question_2 FROM users WHERE id = ?1').bind(user.id).first<{ totp_enabled: number; security_question_1: string | null; security_question_2: string | null }>()
        return json({ totpEnabled: Boolean(row?.totp_enabled), questionsEnabled: Boolean(row?.security_question_1 && row?.security_question_2), questions: [row?.security_question_1, row?.security_question_2].filter(Boolean) })
      },
    },
  },
})
