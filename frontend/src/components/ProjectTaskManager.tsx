import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, Table, Tag, Progress, Space, Typography, Button, Modal, message, Row, Col, Statistic } from 'antd'
import { ReloadOutlined, EyeOutlined, ExclamationCircleOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'
import { useTaskStatus } from '../hooks/useTaskStatus'
import { TaskStatus as TaskStatusType } from '../hooks/useTaskStatus'

const { Title, Text } = Typography
const { confirm } = Modal

interface ProjectTaskManagerProps {
  projectId: string
  projectName?: string
}

export const ProjectTaskManager: React.FC<ProjectTaskManagerProps> = ({ 
  projectId, 
  projectName 
}) => {
  const { t } = useTranslation()
  const { getAllTasks, loading } = useTaskStatus()
  const [selectedTask, setSelectedTask] = useState<TaskStatusType | null>(null)
  const [taskDetailVisible, setTaskDetailVisible] = useState(false)

  // 获取当前项目的任务
  const projectTasks = getAllTasks().filter(task => task.project_id === projectId)
  const activeTasks = projectTasks.filter(task => 
    task.status === 'running' || task.status === 'pending'
  )
  const completedTasks = projectTasks.filter(task => task.status === 'completed')
  const failedTasks = projectTasks.filter(task => task.status === 'failed')

  // 刷新任务列表
  const handleRefresh = () => {
    message.success(t('taskManager.taskListRefreshed'))
  }

  // 查看任务详情
  const handleViewTask = (task: TaskStatusType) => {
    setSelectedTask(task)
    setTaskDetailVisible(true)
  }

  // 删除任务
  const handleDeleteTask = (taskId: string) => {
    confirm({
      title: t('taskManager.confirmDelete'),
      icon: <ExclamationCircleOutlined />,
      content: t('taskManager.deleteTaskConfirm'),
      okText: t('common.delete'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk() {
        message.success(t('taskManager.taskDeleted'))
      }
    })
  }

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'running':
        return <ClockCircleOutlined style={{ color: '#1890ff' }} />
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
      case 'pending':
        return <ClockCircleOutlined style={{ color: '#faad14' }} />
      default:
        return <ClockCircleOutlined style={{ color: '#d9d9d9' }} />
    }
  }

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'success'
      case 'running':
        return 'processing'
      case 'failed':
        return 'error'
      case 'pending':
        return 'warning'
      default:
        return 'default'
    }
  }

  // 表格列定义
  const columns = [
    {
      title: t('taskManager.taskName'),
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: TaskStatusType) => (
        <Space>
          {getStatusIcon(record.status)}
          <Text strong>{text}</Text>
        </Space>
      )
    },
    {
      title: t('taskManager.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={getStatusColor(status)}>
          {status === 'completed' ? t('taskManager.completed') :
           status === 'running' ? t('taskManager.running') :
           status === 'failed' ? t('taskManager.failedStatus') :
           status === 'pending' ? t('taskManager.pending') : status}
        </Tag>
      )
    },
    {
      title: t('taskManager.progress'),
      dataIndex: 'progress',
      key: 'progress',
      render: (progress: number, record: TaskStatusType) => (
        <Progress
          percent={Math.round(progress)}
          size="small"
          status={record.status === 'failed' ? 'exception' : 'normal'}
        />
      )
    },
    {
      title: t('taskManager.currentStep'),
      dataIndex: 'current_step',
      key: 'current_step',
      render: (step: string) => step || '-'
    },
    {
      title: t('taskManager.createdAt'),
      dataIndex: 'created_at',
      key: 'created_at',
      render: (timestamp: string) => (
        <Text type="secondary">
          {new Date(timestamp).toLocaleString('zh-CN')}
        </Text>
      )
    },
    {
      title: t('taskManager.actions'),
      key: 'actions',
      width: 120,
      render: (_: any, record: TaskStatusType) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewTask(record)}
            title={t('taskManager.viewDetail')}
          />
          <Button
            type="text"
            size="small"
            icon={<ExclamationCircleOutlined />}
            onClick={() => handleDeleteTask(record.id)}
            title={t('taskManager.deleteTask')}
            danger
          />
        </Space>
      )
    }
  ]

  if (projectTasks.length === 0) {
    return (
      <Card title={t('taskManager.taskManagement')} size="small">
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Text type="secondary">{t('taskManager.noTaskRecords')}</Text>
        </div>
      </Card>
    )
  }

  return (
    <Card 
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('taskManager.taskManagement')}</span>
          <Button 
            type="primary" 
            size="small"
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          >
            {t('common.refresh')}
          </Button>
        </div>
      }
      size="small"
    >
      {/* 任务统计 */}
      <Row gutter={16} style={{ marginBottom: '16px' }}>
        <Col span={6}>
          <Statistic
            title={t('taskManager.totalTasks')}
            value={projectTasks.length}
            prefix={<ClockCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('taskManager.activeTasks')}
            value={activeTasks.length}
            valueStyle={{ color: '#1890ff' }}
            prefix={<ClockCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('taskManager.completed')}
            value={completedTasks.length}
            valueStyle={{ color: '#52c41a' }}
            prefix={<CheckCircleOutlined />}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title={t('taskManager.failedTasks')}
            value={failedTasks.length}
            valueStyle={{ color: '#ff4d4f' }}
            prefix={<CloseCircleOutlined />}
          />
        </Col>
      </Row>

      {/* 活跃任务 */}
      {activeTasks.length > 0 && (
        <Card 
          size="small" 
          style={{ marginBottom: '16px' }}
          title={`${t('taskManager.activeTasks')} (${activeTasks.length})`}
        >
          <Space wrap>
            {activeTasks.map(task => (
              <div key={task.id} style={{ marginBottom: '8px' }}>
                <Text>{task.message || task.id}</Text>
                <Progress percent={task.progress} size="small" />
              </div>
            ))}
          </Space>
        </Card>
      )}

      {/* 任务列表 */}
      <Table
        columns={columns}
        dataSource={projectTasks}
        rowKey="id"
        pagination={{
          pageSize: 5,
          showSizeChanger: false,
          showTotal: (total, range) =>
            t('taskManager.paginationTotal', { start: range[0], end: range[1], total })
        }}
        size="small"
        loading={loading}
      />

      {/* 任务详情弹窗 */}
      <Modal
        title={t('taskManager.taskDetail')}
        open={taskDetailVisible}
        onCancel={() => setTaskDetailVisible(false)}
        footer={[
          <Button key="close" onClick={() => setTaskDetailVisible(false)}>
            {t('common.close')}
          </Button>
        ]}
        width={800}
      >
        {selectedTask && (
          <div>
            <Text>{t('taskManager.taskId')}: {selectedTask.id}</Text>
            <br />
            <Text>{t('taskManager.status')}: {selectedTask.status}</Text>
            <br />
            <Text>{t('taskManager.progress')}: {selectedTask.progress}%</Text>
            <br />
            <Text>{t('taskManager.message')}: {selectedTask.message}</Text>
          </div>
        )}
      </Modal>
    </Card>
  )
}
