import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Layout, Card, Form, Input, Button, Typography, Space, Alert, Divider, Row, Col, Tabs, message, Select, Tag } from 'antd'
import { KeyOutlined, SaveOutlined, ApiOutlined, SettingOutlined, InfoCircleOutlined, UserOutlined, RobotOutlined } from '@ant-design/icons'
import { settingsApi } from '../services/api'
import BilibiliManager from '../components/BilibiliManager'
import './SettingsPage.css'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs

const SettingsPage: React.FC = () => {
  const { t } = useTranslation()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [showBilibiliManager, setShowBilibiliManager] = useState(false)
  const [availableModels, setAvailableModels] = useState<any>({})
  const [currentProvider, setCurrentProvider] = useState<any>({})
  const [selectedProvider, setSelectedProvider] = useState('dashscope')

  // 提供商配置
  const providerConfig = {
    dashscope: {
      name: t('settings.dashscope'),
      icon: <RobotOutlined />,
      color: '#1890ff',
      description: t('settings.dashscopeDesc'),
      apiKeyField: 'dashscope_api_key',
      placeholder: t('settings.dashscopePlaceholder')
    },
    openai: {
      name: t('settings.openai'),
      icon: <RobotOutlined />,
      color: '#52c41a',
      description: t('settings.openaiDesc'),
      apiKeyField: 'openai_api_key',
      placeholder: t('settings.openaiPlaceholder')
    },
    gemini: {
      name: t('settings.gemini'),
      icon: <RobotOutlined />,
      color: '#faad14',
      description: t('settings.geminiDesc'),
      apiKeyField: 'gemini_api_key',
      placeholder: t('settings.geminiPlaceholder')
    },
    siliconflow: {
      name: t('settings.siliconflow'),
      icon: <RobotOutlined />,
      color: '#722ed1',
      description: t('settings.siliconflowDesc'),
      apiKeyField: 'siliconflow_api_key',
      placeholder: t('settings.siliconflowPlaceholder')
    }
  }

  // 加载数据
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [settings, models, provider] = await Promise.all([
        settingsApi.getSettings(),
        settingsApi.getAvailableModels(),
        settingsApi.getCurrentProvider()
      ])
      
      setAvailableModels(models)
      setCurrentProvider(provider)
      setSelectedProvider(settings.llm_provider || 'dashscope')
      
      // 设置表单初始值
      form.setFieldsValue(settings)
    } catch (error) {
      console.error('加载数据失败:', error)
    }
  }

  // 保存配置
  const handleSave = async (values: any) => {
    try {
      setLoading(true)
      await settingsApi.updateSettings(values)
      message.success(t('settings.configSaved'))
      await loadData() // 重新加载数据
    } catch (error: any) {
      message.error(t('settings.saveFailed') + (error.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 测试API密钥
  const handleTestApiKey = async () => {
    const apiKey = form.getFieldValue(providerConfig[selectedProvider as keyof typeof providerConfig].apiKeyField)
    const modelName = form.getFieldValue('model_name')
    
    if (!apiKey) {
      message.error(t('settings.enterApiKeyFirst'))
      return
    }

    if (!modelName) {
      message.error(t('settings.selectModelFirst'))
      return
    }

    try {
      setLoading(true)
      const result = await settingsApi.testApiKey(selectedProvider, apiKey, modelName)
      if (result.success) {
        message.success(t('settings.apiKeyTestSuccess'))
      } else {
        message.error(t('settings.apiKeyTestFailed') + (result.error || '未知错误'))
      }
    } catch (error: any) {
      message.error(t('settings.testFailed') + (error.message || '未知错误'))
    } finally {
      setLoading(false)
    }
  }

  // 提供商切换
  const handleProviderChange = (provider: string) => {
    setSelectedProvider(provider)
    form.setFieldsValue({ llm_provider: provider })
  }

  return (
    <Content className="settings-page">
      <div className="settings-container">
        <Title level={2} className="settings-title">
          <SettingOutlined /> {t('settings.systemSettings')}
        </Title>
        
        <Tabs defaultActiveKey="api" className="settings-tabs">
          <TabPane tab={t('settings.aiModelConfig')} key="api">
            <Card title={t('settings.aiModelConfig')} className="settings-card">
              <Alert
                message={t('settings.multiProviderSupport')}
                description={t('settings.multiProviderDescription')}
                type="info"
                showIcon
                className="settings-alert"
              />
              
              <Form
                form={form}
                layout="vertical"
                className="settings-form"
                onFinish={handleSave}
                initialValues={{
                  llm_provider: 'dashscope',
                  model_name: 'qwen-plus',
                  chunk_size: 5000,
                  min_score_threshold: 0.7,
                  max_clips_per_collection: 5
                }}
              >
                {/* 当前提供商状态 */}
                {currentProvider.available && (
                  <Alert
                    message={t('settings.currentlyUsing', { provider: currentProvider.display_name, model: currentProvider.model })}
                    type="success"
                    showIcon
                    style={{ marginBottom: 24 }}
                  />
                )}

                {/* 提供商选择 */}
                <Form.Item
                  label={t('settings.selectProvider')}
                  name="llm_provider"
                  className="form-item"
                  rules={[{ required: true, message: t('settings.selectProviderPlaceholder') }]}
                >
                  <Select
                    value={selectedProvider}
                    onChange={handleProviderChange}
                    className="settings-input"
                    placeholder={t('settings.selectProviderPlaceholder')}
                  >
                    {Object.entries(providerConfig).map(([key, config]) => (
                      <Select.Option key={key} value={key}>
                        <Space>
                          <span style={{ color: config.color }}>{config.icon}</span>
                          <span>{config.name}</span>
                          <Tag color={config.color} size="small">{config.description}</Tag>
                        </Space>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                {/* 动态API密钥输入 */}
                <Form.Item
                  label={`${providerConfig[selectedProvider as keyof typeof providerConfig].name} API Key`}
                  name={providerConfig[selectedProvider as keyof typeof providerConfig].apiKeyField}
                  className="form-item"
                  rules={[
                    { required: true, message: t('settings.enterApiKey') },
                    { min: 10, message: t('settings.apiKeyMinLength') }
                  ]}
                >
                  <Input.Password
                    placeholder={providerConfig[selectedProvider as keyof typeof providerConfig].placeholder}
                    prefix={<KeyOutlined />}
                    className="settings-input"
                  />
                </Form.Item>

                {/* 模型选择 */}
                <Form.Item
                  label={t('settings.selectModel')}
                  name="model_name"
                  className="form-item"
                  rules={[{ required: true, message: t('settings.selectModelFirst') }]}
                >
                  <Select
                    className="settings-input"
                    placeholder={t('settings.selectModelPlaceholder')}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.children as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                  >
                    {availableModels[selectedProvider]?.map((model: any) => (
                      <Select.Option key={model.name} value={model.name}>
                        <Space>
                          <span>{model.display_name}</span>
                          <Tag size="small">{t('settings.maxTokens', { count: model.max_tokens })}</Tag>
                        </Space>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                <Form.Item className="form-item">
                  <Space>
                    <Button
                      type="default"
                      icon={<ApiOutlined />}
                      className="test-button"
                      onClick={handleTestApiKey}
                      loading={loading}
                    >
                      {t('settings.testConnection')}
                    </Button>
                  </Space>
                </Form.Item>

                <Divider className="settings-divider" />

                <Title level={4} className="section-title">{t('settings.modelConfig')}</Title>
                
                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label={t('settings.modelName')}
                      name="model_name"
                      className="form-item"
                    >
                      <Input placeholder="qwen-plus" className="settings-input" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label={t('settings.chunkSize')}
                      name="chunk_size"
                      className="form-item"
                    >
                      <Input 
                        type="number" 
                        placeholder="5000" 
                        addonAfter={t('settings.characters')}
                        className="settings-input"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Row gutter={16}>
                  <Col span={12}>
                    <Form.Item
                      label={t('settings.minScoreThreshold')}
                      name="min_score_threshold"
                      className="form-item"
                    >
                      <Input 
                        type="number" 
                        step="0.1" 
                        min="0" 
                        max="1" 
                        placeholder="0.7" 
                        className="settings-input"
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      label={t('settings.maxClipsPerCollection')}
                      name="max_clips_per_collection"
                      className="form-item"
                    >
                      <Input 
                        type="number" 
                        placeholder="5" 
                        addonAfter={t('settings.pieces')}
                        className="settings-input"
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Form.Item className="form-item">
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<SaveOutlined />}
                    size="large"
                    className="save-button"
                    loading={loading}
                  >
                    {t('settings.saveConfig')}
                  </Button>
                </Form.Item>
              </Form>
            </Card>

            <Card title={t('settings.instructions')} className="settings-card">
              <Space direction="vertical" size="large" className="instructions-space">
                <div className="instruction-item">
                  <Title level={5} className="instruction-title">
                    <InfoCircleOutlined /> {t('settings.instructionStep1Title')}
                  </Title>
                  <Paragraph className="instruction-text">
                    {t('settings.instructionStep1Desc')}
                  </Paragraph>
                </div>

                <div className="instruction-item">
                  <Title level={5} className="instruction-title">
                    <InfoCircleOutlined /> {t('settings.instructionStep2Title')}
                  </Title>
                  <Paragraph className="instruction-text">
                    {t('settings.instructionStep2Desc')}
                  </Paragraph>
                </div>

                <div className="instruction-item">
                  <Title level={5} className="instruction-title">
                    <InfoCircleOutlined /> {t('settings.instructionStep3Title')}
                  </Title>
                  <Paragraph className="instruction-text">
                    {t('settings.instructionStep3Desc')}
                  </Paragraph>
                </div>
              </Space>
            </Card>
          </TabPane>

          <TabPane tab={t('settings.bilibiliTab')} key="bilibili">
            <Card title={t('settings.bilibiliAccountManagement')} className="settings-card">
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{ marginBottom: '24px' }}>
                  <UserOutlined style={{ fontSize: '48px', color: '#1890ff', marginBottom: '16px' }} />
                  <Title level={3} style={{ color: '#ffffff', margin: '0 0 8px 0' }}>
                    {t('settings.bilibiliAccountManagement')}
                  </Title>
                  <Text type="secondary" style={{ color: '#b0b0b0', fontSize: '16px' }}>
                    {t('settings.bilibiliDescription')}
                  </Text>
                </div>

                <Space size="large">
                  <Button
                    type="primary"
                    size="large"
                    icon={<UserOutlined />}
                    onClick={() => message.info(t('common.inDevelopment'), 3)}
                    style={{
                      borderRadius: '8px',
                      background: 'linear-gradient(45deg, #1890ff, #36cfc9)',
                      border: 'none',
                      fontWeight: 500,
                      height: '48px',
                      padding: '0 32px',
                      fontSize: '16px'
                    }}
                  >
                    {t('settings.manageBilibiliAccount')}
                  </Button>
                </Space>

                <div style={{ marginTop: '32px', textAlign: 'left', maxWidth: '600px', margin: '32px auto 0' }}>
                  <Title level={4} style={{ color: '#ffffff', marginBottom: '16px' }}>
                    {t('settings.features')}
                  </Title>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                    <div style={{
                      padding: '16px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      border: '1px solid #404040'
                    }}>
                      <Text strong style={{ color: '#1890ff' }}>{t('settings.multiAccountSupport')}</Text>
                      <br />
                      <Text type="secondary" style={{ color: '#b0b0b0' }}>
                        {t('settings.multiAccountSupportDesc')}
                      </Text>
                    </div>
                    <div style={{
                      padding: '16px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      border: '1px solid #404040'
                    }}>
                      <Text strong style={{ color: '#52c41a' }}>{t('settings.secureLogin')}</Text>
                      <br />
                      <Text type="secondary" style={{ color: '#b0b0b0' }}>
                        {t('settings.secureLoginDesc')}
                      </Text>
                    </div>
                    <div style={{
                      padding: '16px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      border: '1px solid #404040'
                    }}>
                      <Text strong style={{ color: '#faad14' }}>{t('settings.quickUpload')}</Text>
                      <br />
                      <Text type="secondary" style={{ color: '#b0b0b0' }}>
                        {t('settings.quickUploadDesc')}
                      </Text>
                    </div>
                    <div style={{
                      padding: '16px',
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '8px',
                      border: '1px solid #404040'
                    }}>
                      <Text strong style={{ color: '#722ed1' }}>{t('settings.batchManagement')}</Text>
                      <br />
                      <Text type="secondary" style={{ color: '#b0b0b0' }}>
                        {t('settings.batchManagementDesc')}
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabPane>
        </Tabs>

        {/* B站管理弹窗 */}
        <BilibiliManager
          visible={showBilibiliManager}
          onClose={() => setShowBilibiliManager(false)}
          onUploadSuccess={() => {
            message.success(t('common.operationSuccess'))
          }}
        />
      </div>
    </Content>
  )
}

export default SettingsPage