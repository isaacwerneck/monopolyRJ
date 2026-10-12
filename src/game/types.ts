export type SpaceKind = 'go' | 'property' | 'rail' | 'utility' | 'tax' | 'chance' | 'chest' | 'jail' | 'free' | 'gotojail'
export type Phase = 'ROLL' | 'BUY' | 'AUCTION' | 'END' | 'DEBT' | 'GAME_OVER'

export interface Space {
  index: number
  name: string
  kind: SpaceKind
  price?: number
  group?: string
  color?: string
  rent?: number[]
  houseCost?: number
  tax?: number
}

export interface Player {
  id: string
  name: string
  color: string
  avatar: number
  balance: number
  position: number
  owned: number[]
  jailTurns: number
  escapeCards: number
  bankrupt: boolean
}

export interface PropertyState {
  ownerId?: string
  houses: number
  mortgaged: boolean
}

export interface Auction {
  space: number
  active: string[]
  cursor: number
  highBid: number
  leader?: string
}

export interface Debt {
  amount: number
  creditorId?: string
  reason: string
}

export interface GameState {
  players: Player[]
  current: number
  phase: Phase
  properties: Record<number, PropertyState>
  dice: [number, number]
  doubles: number
  extraTurn: boolean
  pendingSpace?: number
  buildOpportunity?: number
  takeoverOpportunity?: number
  auction?: Auction
  debt?: Debt
  lastCard?: string
  log: string[]
  winnerId?: string
  turn: number
}

export interface TradeOffer {
  fromId: string
  toId: string
  giveSpace?: number
  receiveSpace?: number
  giveCash: number
  receiveCash: number
}
