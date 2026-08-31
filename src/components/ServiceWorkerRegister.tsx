import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      void navigator.serviceWorker.register('/sw.js')
    }
  }, [])

  return null
}
