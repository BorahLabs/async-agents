import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Sessions from './pages/Sessions'
import SessionDetail from './pages/SessionDetail'
import Providers from './pages/Providers'
import McpServers from './pages/McpServers'
import Skills from './pages/Skills'
import Settings from './pages/Settings'
import './App.css'

export default function App() {
  const [lastUpdated] = useState<Date | null>(null)

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout lastUpdated={lastUpdated} />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<SessionDetail />} />
          <Route path="/providers" element={<Providers />} />
          <Route path="/mcp-servers" element={<McpServers />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
