import { createFileRoute } from '@tanstack/react-router'
import StoryLoomApp from '../components/StoryLoomApp'

export const Route = createFileRoute('/app')({ component: AppRoute })

function AppRoute() {
  return <StoryLoomApp />
}
