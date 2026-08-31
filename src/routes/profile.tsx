import { createFileRoute } from '@tanstack/react-router'
import { ProfilePage } from '../components/AccountPages'

export const Route = createFileRoute('/profile')({ component: ProfilePage })
