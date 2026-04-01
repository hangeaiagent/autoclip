import React from 'react'
import { Switch, Typography } from 'antd'
import { useTranslation } from 'react-i18next'

const { Text } = Typography

const LanguageSwitch: React.FC = () => {
  const { i18n } = useTranslation()
  const isEn = i18n.language === 'en'

  const toggleLanguage = (checked: boolean) => {
    i18n.changeLanguage(checked ? 'en' : 'zh')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <Text style={{ color: isEn ? '#666' : '#4facfe', fontSize: '12px', fontWeight: 600, transition: 'color 0.2s' }}>
        中
      </Text>
      <Switch
        size="small"
        checked={isEn}
        onChange={toggleLanguage}
        style={{
          backgroundColor: isEn ? '#4facfe' : '#4facfe'
        }}
      />
      <Text style={{ color: isEn ? '#4facfe' : '#666', fontSize: '12px', fontWeight: 600, transition: 'color 0.2s' }}>
        EN
      </Text>
    </div>
  )
}

export default LanguageSwitch
