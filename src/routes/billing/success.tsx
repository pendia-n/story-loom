import { createFileRoute } from '@tanstack/react-router'
import { BillingSuccessPage } from '../../components/AccountPages'

export const Route = createFileRoute('/billing/success')({ component: BillingSuccessPage })
