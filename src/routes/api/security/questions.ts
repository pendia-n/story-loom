import { createFileRoute } from '@tanstack/react-router'
import { getCurrentUser, getDatabase, hashRecoveryAnswer, json, requireCsrf } from '../../../lib/server/auth'

export const Route = createFileRoute('/api/security/questions')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        const body = await request.json() as { question1?: string; answer1?: string; question2?: string; answer2?: string }
        const question1 = body.question1?.trim().slice(0, 160) ?? ''
        const question2 = body.question2?.trim().slice(0, 160) ?? ''
        const answer1 = body.answer1?.trim() ?? ''
        const answer2 = body.answer2?.trim() ?? ''
        if (!question1 || !question2 || answer1.length < 3 || answer2.length < 3) return json({ error: 'Add two questions and two answers.' }, { status: 400 })
        if (answer1.toLocaleLowerCase() === answer2.toLocaleLowerCase()) return json({ error: 'The two answers must be different.' }, { status: 400 })
        await getDatabase().prepare('UPDATE users SET security_question_1 = ?1, security_answer_1_hash = ?2, security_question_2 = ?3, security_answer_2_hash = ?4 WHERE id = ?5')
          .bind(question1, await hashRecoveryAnswer(answer1), question2, await hashRecoveryAnswer(answer2), user.id).run()
        return json({ ok: true })
      },
      DELETE: async ({ request }) => {
        const user = await getCurrentUser(request)
        if (!user) return json({ error: 'Sign in first.' }, { status: 401 })
        if (!(await requireCsrf(request))) return json({ error: 'Security check failed.' }, { status: 403 })
        await getDatabase().prepare('UPDATE users SET security_question_1 = NULL, security_answer_1_hash = NULL, security_question_2 = NULL, security_answer_2_hash = NULL WHERE id = ?1').bind(user.id).run()
        return json({ ok: true })
      },
    },
  },
})
