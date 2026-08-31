import { createFileRoute } from '@tanstack/react-router'
import StoryLoomApp from '../components/StoryLoomApp'

export const Route = createFileRoute('/')({ component: App })

function App() {
  return <StoryLoomApp />
}
