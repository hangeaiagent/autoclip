import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import enUS from 'antd/locale/en_US'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import relativeTime from 'dayjs/plugin/relativeTime'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { useTranslation } from 'react-i18next'
import './i18n'
import App from './App.tsx'
import './index.css'

dayjs.extend(relativeTime)
dayjs.extend(timezone)
dayjs.extend(utc)
dayjs.locale('zh-cn')
dayjs.tz.setDefault('Asia/Shanghai')

const Root: React.FC = () => {
  const { i18n } = useTranslation()
  const isEn = i18n.language === 'en'

  React.useEffect(() => {
    dayjs.locale(isEn ? 'en' : 'zh-cn')
  }, [isEn])

  return (
    <ConfigProvider locale={isEn ? enUS : zhCN}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <Root />
)
