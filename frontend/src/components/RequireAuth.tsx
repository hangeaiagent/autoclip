import React from 'react'
import { Spin, Button, Result } from 'antd'
import { LoginOutlined } from '@ant-design/icons'
import { useAuth } from '../context/AuthContext'
import { triggerSsoRedirect } from '../utils/ssoUtils'
import { useTranslation } from 'react-i18next'

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth()
  const { t } = useTranslation()

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 72px)' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!user) {
    const ssoAttempted = sessionStorage.getItem('sso_attempted')
    if (!ssoAttempted) {
      triggerSsoRedirect(window.location.pathname)
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 72px)' }}>
          <Spin size="large" tip={t('auth.redirecting', '正在跳转到登录页面...')} />
        </div>
      )
    }

    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - 72px)' }}>
        <Result
          status="403"
          title={t('auth.loginRequired', '请先登录')}
          subTitle={t('auth.loginRequiredDesc', '您需要登录后才能使用 AutoClip')}
          extra={
            <Button
              type="primary"
              size="large"
              icon={<LoginOutlined />}
              onClick={() => {
                sessionStorage.removeItem('sso_attempted')
                triggerSsoRedirect(window.location.pathname)
              }}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                border: 'none',
                borderRadius: '8px',
                height: '48px',
                padding: '0 32px',
                fontWeight: 500,
              }}
            >
              {t('header.login', '登录')}
            </Button>
          }
        />
      </div>
    )
  }

  return <>{children}</>
}

export default RequireAuth
