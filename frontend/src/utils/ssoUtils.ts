export function shouldAutoSso(): boolean {
  const token = localStorage.getItem('token')
  if (token) return false

  const ssoAttempted = sessionStorage.getItem('sso_attempted')
  if (ssoAttempted) return false

  const referrer = document.referrer
  return referrer.includes('agentpit.io')
}

export function markSsoAttempted(): void {
  sessionStorage.setItem('sso_attempted', 'true')
}

export function triggerSsoRedirect(returnUrl: string = window.location.pathname): void {
  markSsoAttempted()
  window.location.href = `/api/auth/agentpit/sso?returnUrl=${encodeURIComponent(returnUrl)}`
}
