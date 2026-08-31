import { createFileRoute } from '@tanstack/react-router'
import { RecoveryPage } from '../components/AccountPages'

export const Route = createFileRoute('/recovery')({ component: RecoveryPage })
