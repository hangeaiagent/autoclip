import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function SsoCallbackPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { login } = useAuth()

  useEffect(() => {
    const hash = window.location.hash.substring(1)
    const params = new URLSearchParams(hash)
    const token = params.get('token')
    const userStr = params.get('user')
    const returnUrl = searchParams.get('returnUrl') || '/'

    window.history.replaceState(null, '', window.location.pathname)

    if (token && userStr) {
      try {
        const user = JSON.parse(decodeURIComponent(userStr))
        login(token, user)
        navigate(returnUrl, { replace: true })
      } catch {
        navigate('/?sso_error=parse_failed', { replace: true })
      }
    } else {
      navigate('/?sso_error=missing_token', { replace: true })
    }
  }, [])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <span>正在登录...</span>
    </div>
  )
}
