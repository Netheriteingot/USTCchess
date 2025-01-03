import { Chess, Chessboard, Position } from './chessboard'

export interface ExtensionInfo {
  key: string
  name: string
  author: string
  version: string
}

export type ExtNameList = ExtensionInfo['key'][]

export interface Extension extends ExtensionInfo {
  API: ExtensionAPI // defined in chessboard.ts
  init?: () => void
  modifyMove?: (chessboard: Chessboard, pos: Position, availableMoves: Position[]) => void
  afterMove?: (chessboard: Chessboard, from: Position, to: Position, turn: number) => void
  onDeath?: (chessboard: Chessboard, pos: Position, oldChess: Chess) => void
}
