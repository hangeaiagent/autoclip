import { } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from 'antd'
import HomePage from './pages/HomePage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import SsoCallbackPage from './pages/SsoCallbackPage'
import Header from './components/Header'
import { AuthProvider } from './context/AuthContext'

const { Content } = Layout

function App() {
  console.log('🎬 App组件已加载');

  return (
    <AuthProvider>
      <Layout>
        <Header />
        <Content>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/project/:id" element={<ProjectDetailPage />} />
            <Route path="/auth/sso/callback" element={<SsoCallbackPage />} />
          </Routes>
        </Content>
      </Layout>
    </AuthProvider>
  )
}

export default App