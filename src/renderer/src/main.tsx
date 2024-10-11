import './assets/main.css'

import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'

import { HomeOutlined, AppstoreOutlined, SettingOutlined } from '@ant-design/icons'
import type { TabsProps } from 'antd'
import { ConfigProvider, Tabs } from 'antd'
import enUS from 'antd/locale/en_US'
import zhCN from 'antd/locale/zh_CN'

import StartPage from './components/StartPage'
import ExtensionPage from './components/ExtensionPage'
import SettingPage from './components/SettingPage'

const tabItems: TabsProps['items'] = [
  {
    key: 'start',
    label: '开始',
    icon: <HomeOutlined />,
    children: <StartPage />
  },
  {
    key: 'extension',
    label: '扩展',
    icon: <AppstoreOutlined />,
    children: <ExtensionPage />
  },
  {
    key: 'setting',
    label: '设置',
    icon: <SettingOutlined />,
    children: <SettingPage />
  }
]

const localeOptions = {
  enUS: enUS,
  zhCN: zhCN
}

function App(): JSX.Element {
  const [initialized, setInitialized] = useState<boolean>(false)
  const [locale, setLocale] = useState<string>('')
  const [primaryColor, setPrimaryColor] = useState<string>('')
  const reload = async (): Promise<void> => {
    setLocale(await window.electronAPI.getSetting('language'))
    setPrimaryColor(await window.electronAPI.getSetting('primary-color'))
  }
  if (!initialized) {
    reload()
    window.addEventListener('updatesettings', reload)
    setInitialized(true)
  }

  return (
    <ConfigProvider
      locale={localeOptions[locale]}
      theme={{ token: { colorPrimary: primaryColor } }}
    >
      <Tabs
        defaultActiveKey="1"
        centered
        items={tabItems}
        style={{ '--primary-color': primaryColor, height: '100vh' }}
      />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
