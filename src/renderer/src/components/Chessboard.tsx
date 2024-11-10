import '../assets/chessboard.css'

import { CSSProperties, useState } from 'react'

import { Chessboard, Position } from 'src/types/chessboard'

interface ChessboardComponentProps {
  chessboard: Chessboard
  maxWidth: CSSProperties['maxWidth']
  maxHeight: CSSProperties['maxHeight']
  intersection: boolean
  reverse?: boolean
  draggable?: boolean
  getAvailableMoves: (pos: Position) => Promise<Position[]>
  canMove?: (pos: Position) => Promise<boolean>
  move?: (from: Position, to: Position) => void
}

const isEqualPosition = (pos1: Position, pos2: Position): boolean =>
  pos1[0] === pos2[0] && pos1[1] === pos2[1]

function ChessboardComponent({
  chessboard,
  maxWidth,
  maxHeight,
  intersection,
  reverse = false,
  draggable = false,
  getAvailableMoves,
  canMove,
  move
}: ChessboardComponentProps): JSX.Element {
  const [selectedPosition, setSelectedPosition] = useState<Position>()
  const [draggingPiece, setDraggingPosition] = useState<Position>()
  const [availableMoves, setAvailableMoves] = useState<Position[]>([])

  const isInAvailableMoves = (pos: Position): boolean => {
    return availableMoves.some((p) => isEqualPosition(p, pos))
  }

  const enterCell = async (pos: Position): Promise<void> => {
    if (selectedPosition) return
    setAvailableMoves(await getAvailableMoves(pos))
  }
  const leaveCell = (): void => {
    if (selectedPosition) return
    setAvailableMoves([])
  }
  const chooseCell = async (pos: Position): Promise<void> => {
    if (selectedPosition) {
      if (isInAvailableMoves(pos)) move?.(selectedPosition, pos)
      setSelectedPosition(undefined)
      setAvailableMoves([])
    } else if (await canMove?.(pos)) {
      setSelectedPosition(pos)
      setAvailableMoves(await getAvailableMoves(pos))
    }
  }
  const onDragStart = async (e, pos: Position): Promise<void> => {
    if (selectedPosition || !(await canMove?.(pos))) return e.preventDefault()
    setAvailableMoves(await getAvailableMoves(pos))
    setDraggingPosition(pos)
  }
  const onDrop = (pos: Position): void => {
    if (draggingPiece && isInAvailableMoves(pos)) {
      move?.(draggingPiece, pos)
      setSelectedPosition(undefined)
      setDraggingPosition(undefined)
      setAvailableMoves([])
    }
  }

  const width = chessboard[0].length
  const height = chessboard.length
  const cellSize = `calc(min(${maxWidth} / ${width}, ${maxHeight} / ${height}))`
  const getChessboardCell = (pos: Position): JSX.Element => {
    const chess = chessboard[pos[0]][pos[1]]
    const cellDraggable = draggable && Boolean(chess)
    const cellStyle: React.CSSProperties = {
      width: cellSize,
      height: cellSize,
      color: chess ? (chess.camp == 1 ? 'red' : chess.camp == 2 ? 'blue' : 'green') : 'black',
      cursor: cellDraggable ? 'grab' : 'pointer',
      ...(selectedPosition && isEqualPosition(selectedPosition, pos)
        ? { backgroundColor: 'yellow' }
        : {}),
      ...(isInAvailableMoves(pos) ? { backgroundColor: chess ? 'pink' : 'greenyellow' } : {})
    }
    return (
      <div
        style={cellStyle}
        className="chessboard-cell"
        key={`cell-${pos[0]}-${pos[1]}`}
        onMouseEnter={() => enterCell(pos)}
        onMouseLeave={leaveCell}
        onClick={() => chooseCell(pos)}
        draggable={cellDraggable}
        onDragStart={(e) => onDragStart(e, pos)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDrop(pos)}
      >
        {chess?.name}
      </div>
    )
  }

  return (
    <div id={intersection ? 'iboard' : 'board'}>
      {Array.from({ length: height }, (_, i) => {
        const rvsi = reverse ? height - i - 1 : i
        return (
          <div className="chessboard-row" key={`row-${i}`}>
            {Array.from({ length: width }, (_, j) => {
              const rvsj = reverse ? width - j - 1 : j
              const pos: Position = [rvsi, rvsj]
              return getChessboardCell(pos)
            })}
          </div>
        )
      })}
    </div>
  )
}

export default ChessboardComponent
