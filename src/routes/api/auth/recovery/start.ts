import { createFileRoute } from '@tanstack/react-router'
import { createRecoveryChallenge, getRecoveryUser, json, requireSameOrigin } from '../../../../lib/server/auth'

export const Route = createFileRoute('/api/auth/recovery/start')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!requireSameOrigin(request)) return json({ error: 'Invalid request origin.' }, { status: 403 })
        const body = await request.json() as { username?: string; method?: string }
        const username = body.username?.trim().toLowerCase() ?? ''
        const user = await getRecoveryUser(username)
        if (!user) return json({ error: 'No recovery path is available for that username.' }, { status: 404 })
        const methods = {
          totp: Boolean(user.totp_enabled && user.totp_secret),
          security: Boolean(user.security_question_1 && user.security_question_2 && user.security_answer_1_hash && user.security_answer_2_hash),
        }
        const method = body.method === 'security' ? 'security' : body.method === 'totp' ? 'totp' : null
        if (method && !methods[method]) return json({ error: 'That recovery method is not enabled.' }, { status: 400 })
        if (!method) return json({ methods, questions: methods.security ? [user.security_question_1, user.security_question_2] : [] })
        const recoveryId = await createRecoveryChallenge(user.id, method)
        return json({ recoveryId, method, questions: method === 'security' ? [user.security_question_1, user.security_question_2] : [] })
      },
    },
  },
})
