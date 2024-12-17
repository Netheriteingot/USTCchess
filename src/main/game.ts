import {
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  MenuItemConstructorOptions,
  shell
} from 'electron'
import { join } from 'node:path'
import { RawData, WebSocket } from 'ws'
import { is } from '@electron-toolkit/utils'

import { autoGetNeededExtensions, checkExtensions } from './main'

import { Chessboard, Position } from '../types/chessboard'
import { Map as GameMap } from '../types/map'
import { Response } from '../types/game'
import { getInfo } from '../utils/map'
import { GameData } from '../utils/game'

function createGameWindow(menuTemplate: MenuItemConstructorOptions[]): BrowserWindow {
  const gameWindow = new BrowserWindow({
    width: 480,
    height: 720,
    minWidth: 360,
    minHeight: 600,
    show: false,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js')
    }
  })

  const menu = Menu.buildFromTemplate(menuTemplate)
  gameWindow.setMenu(menu)

  gameWindow.on('ready-to-show', () => {
    gameWindow.show()
  })

  gameWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    gameWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/game.html`)
  } else {
    gameWindow.loadFile(join(__dirname, '../renderer/game.html'))
  }
  return gameWindow
}

class GameClient extends GameData {
  id: number
  window: BrowserWindow
  close: (content?: string) => void
  // WebSocket
  private ws: WebSocket
  private timeout: number = 10000
  private isLocal: boolean
  private isConnectSuccess: boolean = false
  private messageHandlers: Map<string, (response: Response) => void> = new Map()
  // Game
  private camp: number = 0
  isGameEnd: boolean = false
  constructor(address: string, close: () => void, isLocal: boolean) {
    super()
    this.ws = new WebSocket(`ws://${address}`)
    this.ws.on('message', this.onMessage.bind(this))
    this.ws.on('error', () => setTimeout(() => this.close('无法连接到服务器'), 500))
    this.ws.on('close', (code) => {
      this.isConnectSuccess = false
      if (code === 4004) this.close(isLocal ? '' : '对方已断开连接')
    })
    this.close = (content?): void => {
      if (this.isConnectSuccess) this.ws.close()
      if (content) dialog.showErrorBox('错误', content)
      close()
    }
    this.isLocal = isLocal

    const menuTemplate: MenuItemConstructorOptions[] = [
      {
        label: '查看地图信息',
        click: (): void => {
          if (this.mapData) {
            const [msg, detail] = getInfo(this.mapData)
            dialog.showMessageBox(this.window, {
              type: 'info',
              title: '地图信息',
              message: msg,
              detail: detail
            })
          } else {
            dialog.showErrorBox('错误', '未获取到地图信息')
          }
        }
      }
    ]
    if (!isLocal) {
      menuTemplate.push({
        label: '服务器',
        submenu: [
          {
            label: '查看服务器信息',
            click: (): void => {
              dialog.showMessageBox(this.window, {
                type: 'info',
                title: '服务器信息',
                message: `地址：${address}`
              })
            }
          },
          {
            label: '复制地址',
            click: (): void => {
              clipboard.writeText(address)
            }
          }
        ]
      })
    }
    this.window = createGameWindow(menuTemplate)
    this.window.setTitle(`USTC棋 - ${isLocal ? '本地模式' : '联机模式'}`)
    this.id = this.window.webContents.id
    setTimeout(() => {
      if (!this.isConnectSuccess) {
        this.ws.close(4000)
      }
    }, this.timeout)
  }

  private async onMessage(rawData: RawData): Promise<void> {
    let data: { type: string; data?: unknown; id?: string }
    try {
      data = JSON.parse(rawData.toString())
    } catch {
      console.error('Invalid Response:', rawData)
      return
    }

    if (data.id && this.messageHandlers.has(data.id)) {
      const handler = this.messageHandlers.get(data.id)
      if (handler) {
        handler({ status: data.type, data: data.data })
      }
    } else {
      switch (data.type) {
        case 'connect-success': {
          this.isConnectSuccess = true
          const { camp, mapData } = data.data as { camp: number; mapData: GameMap }
          this.mapData = mapData
          this.loadExtensions(await autoGetNeededExtensions(mapData.extensions))
          if (!(this.isLocal || checkExtensions(this.extensions, this.mapData!.extensions))) {
            const requiredExtensions = Object.entries(this.mapData.extensions)
              .map(([key, version]) => `${key}@${version}`)
              .join('\n  ')
            const existingExtensions =
              this.extensions.map((ext) => `${ext.key}@${ext.version}`).join('\n  ') || '无'
            await dialog.showMessageBox(this.window, {
              type: 'error',
              title: '错误',
              message: '已启用扩展与服务器不匹配',
              detail: `所需扩展：\n  ${requiredExtensions}\n已有扩展：\n  ${existingExtensions}`
            })
            return this.close()
          }
          this.camp = camp
          this.ws.send(JSON.stringify({ type: 'prepared' }))
          this.window.setTitle(`${mapData.name} - ${this.isLocal ? '本地模式' : '联机模式'}`)
          this.window.webContents.send('connect-success')
          break
        }
        case 'connect-fail':
          if (data.data === 'too-many-clients') {
            setTimeout(() => this.close('游戏房间已满'), 500)
          } else {
            this.close(data.data as string)
          }
          break
        case 'game-start':
        case 'change-turn':
          this.window.webContents.send(data.type)
          break
        case 'game-end':
          this.isGameEnd = true
          this.window.webContents.send('game-end', data.data)
          break
        default:
          console.error('Unknown Response:', data)
      }
    }
  }

  async contact(type: string, data?: unknown): Promise<Response> {
    switch (type) {
      case 'get-info':
        if (this.camp && this.mapData) {
          return { status: 'success', data: { camp: this.camp, mapData: this.mapData } }
        } else {
          return { status: 'error', data: 'Fail to get info.' }
        }
      case 'get-state': {
        const res = await this.contactToServer(type, data)
        if (res.status === 'success') {
          if (res.data && typeof res.data === 'object' && 'chessboard' in res.data) {
            this.chessboard = (res.data as { chessboard: Chessboard }).chessboard
          }
        }
        return res
      }
      case 'get-available-moves':
        return { status: 'success', data: this.getAvailableMoves(data as Position) }
      case 'get-is-checked':
        return { status: 'success', data: this.getIsChecked() }
      case 'move': {
        return await this.contactToServer(type, data)
      }
      default:
        return { status: 'error', data: 'Unknown type.' }
    }
  }

  contactToServer(type: string, data?: unknown): Promise<Response> {
    return new Promise((resolve) => {
      const messageId = Math.random().toString(36).substring(2)
      try {
        const message = JSON.stringify({ type, data, id: messageId })
        this.messageHandlers.set(messageId, (response: Response): void => {
          this.messageHandlers.delete(messageId)
          resolve(response)
        })
        this.ws.send(message)
      } catch {
        resolve({ status: 'error', data: 'Failed to send message.' })
      }

      setTimeout(() => {
        if (this.messageHandlers.has(messageId)) {
          this.messageHandlers.delete(messageId)
          resolve({ status: 'error', data: 'Timeout waiting for response.' })
        }
      }, this.timeout)
    })
  }

  getIsChecked(): Position[] {
    const myChiefPos: Position[] = []
    const opponentMoves = new Set<string>()
    for (let i = 0; i < this.chessboard.length; i++) {
      for (let j = 0; j < this.chessboard[i].length; j++) {
        const chess = this.chessboard[i][j]
        if (chess?.camp === this.camp) {
          if (chess.isChief) myChiefPos.push([i, j])
        } else {
          this.getAvailableMoves([i, j]).forEach((p) => opponentMoves.add(JSON.stringify(p)))
        }
      }
    }
    return myChiefPos.filter((p) => opponentMoves.has(JSON.stringify(p)))
  }
}

export const checkOnClose = async (window: BrowserWindow): Promise<boolean> => {
  const res = await dialog.showMessageBox(window, {
    type: 'warning',
    buttons: ['确定', '取消'],
    cancelId: 1,
    title: '退出游戏',
    message: '游戏正在运行中，确定要退出游戏吗？',
    noLink: true
  })
  return res.response === 0
}

export function createClients(
  address: string,
  clientCount: number,
  stopGame: () => void,
  isLocal: boolean = true
): void {
  let isClosed = false
  const close = (): void => {
    if (isClosed) return
    isClosed = true
    gameClients.forEach((c) => c.window.destroy())
    ipcMain.removeHandler('contact')
    stopGame()
  }
  const gameClients = Array.from(
    { length: clientCount },
    () => new GameClient(address, close, isLocal)
  )
  if (gameClients.length === 2) {
    const position = gameClients[0].window.getPosition()
    const windowWidth = gameClients[0].window.getBounds().width
    gameClients[0].window.setPosition(position[0] - windowWidth * 0.6, position[1])
    gameClients[1].window.setPosition(position[0] + windowWidth * 0.6, position[1])
  }
  ipcMain.handle('contact', async (_e, type: string, data: unknown) => {
    for (const c of gameClients) {
      if (c.id === _e.sender.id) return await c.contact(type, data)
    }
    throw new Error('The window is not a game window.')
  })
  for (const c of gameClients) {
    c.window.on('close', async (e) => {
      e.preventDefault()
      if (c.isGameEnd || (await checkOnClose(c.window))) {
        c.close()
      }
    })
  }
}
