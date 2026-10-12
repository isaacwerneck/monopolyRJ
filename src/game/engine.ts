import { chanceCards, chestCards, spaces, type Card } from './data'
import type { Auction, GameState, Player, TradeOffer } from './types'

export const PLAYER_COLORS = ['#ff5d73', '#4cc9f0', '#ffd166', '#7ae582', '#b388ff', '#ff9f1c']

const copy = (state: GameState): GameState => structuredClone(state)
const activePlayers = (state: GameState) => state.players.filter(player => !player.bankrupt)
const currentPlayer = (state: GameState) => state.players[state.current]
const addLog = (state: GameState, text: string) => { state.log = [text, ...state.log].slice(0, 18) }

export function createGame(names: string[]): GameState {
  if (names.length < 2 || names.length > 6) throw new Error('A partida precisa de 2 a 6 jogadores.')
  const players: Player[] = names.map((name, index) => ({
    id: `p${index + 1}`,
    name: name.trim() || `Jogador ${index + 1}`,
    color: PLAYER_COLORS[index],
    avatar: index % 4,
    balance: 1500,
    position: 0,
    owned: [],
    jailTurns: 0,
    escapeCards: 0,
    bankrupt: false,
  }))
  return {
    players,
    current: 0,
    phase: 'ROLL',
    properties: Object.fromEntries(spaces.filter(space => ['property', 'rail', 'utility'].includes(space.kind)).map(space => [space.index, { houses: 0, mortgaged: false }])),
    dice: [1, 1],
    doubles: 0,
    extraTurn: false,
    log: [`${players[0].name} começa.`],
    turn: 1,
  }
}

function ownsGroup(state: GameState, playerId: string, group?: string) {
  if (!group) return false
  const groupSpaces = spaces.filter(space => space.group === group)
  return groupSpaces.length > 0 && groupSpaces.every(space => state.properties[space.index].ownerId === playerId)
}

export function rentFor(state: GameState, spaceIndex: number, roll = state.dice[0] + state.dice[1]) {
  const space = spaces[spaceIndex]
  const property = state.properties[spaceIndex]
  if (!property?.ownerId || property.mortgaged) return 0
  if (space.kind === 'rail') {
    const count = spaces.filter(item => item.kind === 'rail' && state.properties[item.index].ownerId === property.ownerId).length
    return 25 * (2 ** (count - 1))
  }
  if (space.kind === 'utility') {
    const count = spaces.filter(item => item.kind === 'utility' && state.properties[item.index].ownerId === property.ownerId).length
    return roll * (count === 2 ? 10 : 4)
  }
  const base = space.rent?.[property.houses] || 0
  return property.houses === 0 && ownsGroup(state, property.ownerId, space.group) ? base * 2 : base
}

export function takeoverPrice(state: GameState, spaceIndex: number) {
  const space = spaces[spaceIndex]
  const property = state.properties[spaceIndex]
  return Math.ceil((space.price || 0) * 1.5 + (space.houseCost || 0) * (property?.houses || 0))
}

function owe(state: GameState, amount: number, reason: string, creditorId?: string) {
  const player = currentPlayer(state)
  if (amount <= 0) return
  if (player.balance >= amount) {
    player.balance -= amount
    if (creditorId) state.players.find(item => item.id === creditorId)!.balance += amount
    addLog(state, `${player.name} pagou R$ ${amount} ${reason}.`)
  } else {
    state.debt = { amount, creditorId, reason }
    state.phase = 'DEBT'
    addLog(state, `${player.name} precisa levantar R$ ${amount} ${reason}.`)
  }
}

function moveTo(state: GameState, target: number, collect = true) {
  const player = currentPlayer(state)
  if (collect && target <= player.position) {
    player.balance += 200
    addLog(state, `${player.name} completou a volta e recebeu R$ 200.`)
  }
  player.position = target
}

function sendToWait(state: GameState) {
  const player = currentPlayer(state)
  player.position = 10
  player.jailTurns = 1
  state.extraTurn = false
  state.doubles = 0
  state.phase = 'END'
  addLog(state, `${player.name} foi para a espera.`)
}

function cardCost(state: GameState, card: Card) {
  const player = currentPlayer(state)
  if (card.type !== 'repairs') return Math.abs(card.amount || 0)
  return player.owned.reduce((total, index) => {
    const houses = state.properties[index].houses
    return total + (houses === 5 ? 100 : houses * 25)
  }, 0)
}

function drawCard(state: GameState, deck: 'chance' | 'chest') {
  const cards = deck === 'chance' ? chanceCards : chestCards
  const card = cards[Math.floor(Math.random() * cards.length)]
  const player = currentPlayer(state)
  state.lastCard = card.text
  addLog(state, `${player.name}: ${card.text}`)
  if (card.type === 'money') {
    if ((card.amount || 0) >= 0) player.balance += card.amount || 0
    else owe(state, Math.abs(card.amount || 0), 'pela carta')
  } else if (card.type === 'move' && card.target !== undefined) {
    moveTo(state, card.target)
    resolveSpace(state)
  } else if (card.type === 'relative') {
    const target = (player.position + (card.amount || 0) + 40) % 40
    moveTo(state, target, (card.amount || 0) > 0)
    resolveSpace(state)
  } else if (card.type === 'jail') sendToWait(state)
  else if (card.type === 'escape') player.escapeCards += 1
  else if (card.type === 'repairs') owe(state, cardCost(state, card), 'nos reparos')
}

function resolveSpace(state: GameState) {
  const player = currentPlayer(state)
  const space = spaces[player.position]
  state.pendingSpace = undefined
  state.buildOpportunity = undefined
  state.takeoverOpportunity = undefined
  if (['property', 'rail', 'utility'].includes(space.kind)) {
    const property = state.properties[space.index]
    if (!property.ownerId) {
      state.pendingSpace = space.index
      state.phase = 'BUY'
      addLog(state, `${space.name} está disponível por R$ ${space.price}.`)
    } else if (property.ownerId === player.id && space.kind === 'property') {
      state.buildOpportunity = space.index
      addLog(state, `${player.name} pode melhorar ${space.name}.`)
    } else if (property.ownerId !== player.id) {
      if (!property.mortgaged) owe(state, rentFor(state, space.index), `de aluguel em ${space.name}`, property.ownerId)
      if (state.phase !== 'DEBT') state.takeoverOpportunity = space.index
    }
  } else if (space.kind === 'tax') owe(state, space.tax || 0, `em ${space.name}`)
  else if (space.kind === 'chance' || space.kind === 'chest') drawCard(state, space.kind)
  else if (space.kind === 'gotojail') sendToWait(state)
}

function finishAction(state: GameState) {
  if (state.phase !== 'DEBT' && state.phase !== 'BUY' && state.phase !== 'AUCTION') state.phase = state.extraTurn ? 'ROLL' : 'END'
}

export function rollDice(state: GameState, forced?: [number, number]) {
  if (state.phase !== 'ROLL') return state
  const next = copy(state)
  next.buildOpportunity = undefined
  next.takeoverOpportunity = undefined
  const player = currentPlayer(next)
  const dice: [number, number] = forced || [Math.ceil(Math.random() * 6), Math.ceil(Math.random() * 6)]
  next.dice = dice
  next.lastCard = undefined
  const isDouble = dice[0] === dice[1]

  if (player.jailTurns > 0) {
    if (isDouble) {
      player.jailTurns = 0
      next.doubles = 0
      next.extraTurn = false
      addLog(next, `${player.name} tirou uma dupla e saiu da espera.`)
    } else if (player.jailTurns >= 3) {
      player.jailTurns = 0
      owe(next, 50, 'para sair da espera')
      if (next.phase === 'DEBT') return next
    } else {
      player.jailTurns += 1
      next.extraTurn = false
      next.phase = 'END'
      addLog(next, `${player.name} continua na espera.`)
      return next
    }
  } else {
    next.doubles = isDouble ? next.doubles + 1 : 0
    if (next.doubles === 3) {
      sendToWait(next)
      return next
    }
    next.extraTurn = isDouble
  }

  const total = dice[0] + dice[1]
  moveTo(next, (player.position + total) % 40)
  addLog(next, `${player.name} tirou ${total} e chegou em ${spaces[player.position].name}.`)
  resolveSpace(next)
  finishAction(next)
  return next
}

export function buyProperty(state: GameState) {
  if (state.phase !== 'BUY' || state.pendingSpace === undefined) return state
  const next = copy(state)
  const player = currentPlayer(next)
  const space = spaces[state.pendingSpace]
  if (player.balance < (space.price || 0)) return next
  player.balance -= space.price || 0
  player.owned.push(space.index)
  next.properties[space.index].ownerId = player.id
  if (space.kind === 'property') next.buildOpportunity = space.index
  addLog(next, `${player.name} fechou ${space.name} por R$ ${space.price}.`)
  next.pendingSpace = undefined
  next.phase = next.extraTurn ? 'ROLL' : 'END'
  return next
}

export function declineProperty(state: GameState) {
  if (state.phase !== 'BUY' || state.pendingSpace === undefined) return state
  const next = copy(state)
  addLog(next, `${currentPlayer(next).name} não comprou ${spaces[next.pendingSpace!].name}.`)
  next.pendingSpace = undefined
  next.phase = next.extraTurn ? 'ROLL' : 'END'
  return next
}

export function buyFromPlayer(state: GameState) {
  if (!['ROLL', 'END'].includes(state.phase) || state.takeoverOpportunity === undefined) return state
  const next = copy(state)
  const index = next.takeoverOpportunity!
  const buyer = currentPlayer(next)
  const property = next.properties[index]
  const seller = next.players.find(player => player.id === property.ownerId)
  const price = takeoverPrice(next, index)
  if (!seller || seller.id === buyer.id || buyer.balance < price) return state
  buyer.balance -= price
  seller.balance += price
  seller.owned = seller.owned.filter(item => item !== index)
  buyer.owned.push(index)
  property.ownerId = buyer.id
  next.takeoverOpportunity = undefined
  addLog(next, `${buyer.name} comprou ${spaces[index].name} de ${seller.name} por R$ ${price}.`)
  return next
}

export function declineTakeover(state: GameState) {
  if (state.takeoverOpportunity === undefined) return state
  const next = copy(state)
  next.takeoverOpportunity = undefined
  return next
}

function nextAuctionBidder(auction: Auction) {
  if (auction.active.length === 0) return undefined
  for (let step = 1; step <= auction.active.length; step += 1) {
    const index = (auction.cursor + step) % auction.active.length
    if (auction.active[index] !== auction.leader) return index
  }
  return undefined
}

function finishAuction(state: GameState) {
  const auction = state.auction!
  if (auction.leader) {
    const winner = state.players.find(player => player.id === auction.leader)!
    winner.balance -= auction.highBid
    winner.owned.push(auction.space)
    state.properties[auction.space].ownerId = winner.id
    addLog(state, `${winner.name} levou ${spaces[auction.space].name} no leilão por R$ ${auction.highBid}.`)
  } else addLog(state, `${spaces[auction.space].name} ficou com o banco.`)
  state.auction = undefined
  state.pendingSpace = undefined
  state.phase = state.extraTurn ? 'ROLL' : 'END'
}

export function startAuction(state: GameState) {
  if (state.phase !== 'BUY' || state.pendingSpace === undefined) return state
  const next = copy(state)
  const spaceIndex = state.pendingSpace
  const auction: Auction = { space: spaceIndex, active: activePlayers(next).map(player => player.id), cursor: -1, highBid: 0 }
  next.auction = auction
  next.phase = 'AUCTION'
  auction.cursor = nextAuctionBidder(auction) ?? 0
  addLog(next, `Começou o leilão de ${spaces[spaceIndex].name}.`)
  return next
}

export function auctionBid(state: GameState, increment: number) {
  if (state.phase !== 'AUCTION' || !state.auction) return state
  const next = copy(state)
  const auction = next.auction!
  const bidderId = auction.active[auction.cursor]
  const bidder = next.players.find(player => player.id === bidderId)!
  const bid = auction.highBid + increment
  if (bid > bidder.balance) return next
  auction.highBid = bid
  auction.leader = bidderId
  addLog(next, `${bidder.name} ofereceu R$ ${bid}.`)
  const following = nextAuctionBidder(auction)
  if (following === undefined) finishAuction(next)
  else auction.cursor = following
  return next
}

export function auctionPass(state: GameState) {
  if (state.phase !== 'AUCTION' || !state.auction) return state
  const next = copy(state)
  const auction = next.auction!
  const bidderId = auction.active[auction.cursor]
  addLog(next, `${next.players.find(player => player.id === bidderId)!.name} passou.`)
  auction.active.splice(auction.cursor, 1)
  if (!auction.leader && auction.active.length === 0) finishAuction(next)
  else if (auction.active.length === 1 && auction.active[0] === auction.leader) finishAuction(next)
  else {
    auction.cursor = Math.max(-1, auction.cursor - 1)
    const following = nextAuctionBidder(auction)
    if (following === undefined) finishAuction(next)
    else auction.cursor = following
  }
  return next
}

export function endTurn(state: GameState) {
  if (state.phase !== 'END') return state
  const next = copy(state)
  next.buildOpportunity = undefined
  next.takeoverOpportunity = undefined
  if (next.extraTurn) {
    next.phase = 'ROLL'
    return next
  }
  let index = next.current
  do index = (index + 1) % next.players.length
  while (next.players[index].bankrupt)
  next.current = index
  next.phase = 'ROLL'
  next.doubles = 0
  next.turn += 1
  addLog(next, `Vez de ${currentPlayer(next).name}.`)
  return next
}

export function leaveWait(state: GameState, useCard = false) {
  if (state.phase !== 'ROLL' || currentPlayer(state).jailTurns === 0) return state
  const next = copy(state)
  const player = currentPlayer(next)
  if (useCard && player.escapeCards > 0) {
    player.escapeCards -= 1
    player.jailTurns = 0
    addLog(next, `${player.name} usou a carta de saída.`)
  } else if (!useCard && player.balance >= 50) {
    player.balance -= 50
    player.jailTurns = 0
    addLog(next, `${player.name} pagou R$ 50 para sair da espera.`)
  }
  return next
}

function groupProperties(spaceIndex: number) {
  const group = spaces[spaceIndex].group
  return spaces.filter(space => space.group === group).map(space => space.index)
}

export function build(state: GameState, spaceIndex: number) {
  const next = copy(state)
  const player = currentPlayer(next)
  const space = spaces[spaceIndex]
  const property = next.properties[spaceIndex]
  const allLevels = Object.values(next.properties).map(item => item.houses)
  const noPieces = property.houses === 4 ? allLevels.filter(level => level === 5).length >= 12 : allLevels.reduce((total, level) => total + Math.min(level, 4), 0) >= 32
  if (!['ROLL', 'END'].includes(next.phase) || next.buildOpportunity !== spaceIndex || property.ownerId !== player.id || property.mortgaged || property.houses >= 5 || player.balance < (space.houseCost || 0) || noPieces) return state
  player.balance -= space.houseCost || 0
  property.houses += 1
  next.buildOpportunity = undefined
  addLog(next, `${player.name} melhorou ${space.name}.`)
  return next
}

export function sellBuilding(state: GameState, spaceIndex: number) {
  const next = copy(state)
  const player = currentPlayer(next)
  const space = spaces[spaceIndex]
  const property = next.properties[spaceIndex]
  if (!property || property.ownerId !== player.id || property.houses === 0) return state
  property.houses -= 1
  player.balance += Math.floor((space.houseCost || 0) / 2)
  addLog(next, `${player.name} vendeu uma melhoria de ${space.name}.`)
  return next
}

export function toggleMortgage(state: GameState, spaceIndex: number) {
  const next = copy(state)
  const player = currentPlayer(next)
  const space = spaces[spaceIndex]
  const property = next.properties[spaceIndex]
  if (!property || property.ownerId !== player.id) return state
  if (!property.mortgaged) {
    if (property.houses > 0) return state
    property.mortgaged = true
    player.balance += Math.floor((space.price || 0) / 2)
    addLog(next, `${player.name} hipotecou ${space.name}.`)
  } else {
    const cost = Math.ceil((space.price || 0) * 0.55)
    if (player.balance < cost) return state
    player.balance -= cost
    property.mortgaged = false
    addLog(next, `${player.name} quitou a hipoteca de ${space.name}.`)
  }
  return next
}

export function settleDebt(state: GameState) {
  if (state.phase !== 'DEBT' || !state.debt || currentPlayer(state).balance < state.debt.amount) return state
  const next = copy(state)
  const player = currentPlayer(next)
  player.balance -= next.debt!.amount
  if (next.debt!.creditorId) next.players.find(item => item.id === next.debt!.creditorId)!.balance += next.debt!.amount
  addLog(next, `${player.name} quitou a dívida de R$ ${next.debt!.amount}.`)
  next.debt = undefined
  next.phase = next.extraTurn ? 'ROLL' : 'END'
  return next
}

export function declareBankruptcy(state: GameState) {
  if (state.phase !== 'DEBT' || !state.debt) return state
  const next = copy(state)
  const player = currentPlayer(next)
  const creditorId = state.debt.creditorId
  const creditor = creditorId ? next.players.find(item => item.id === creditorId) : undefined
  player.owned.forEach(index => {
    const property = next.properties[index]
    property.houses = 0
    property.ownerId = creditor?.id
    if (!creditor) property.mortgaged = false
    else creditor.owned.push(index)
  })
  if (creditor) creditor.balance += player.balance
  player.balance = 0
  player.owned = []
  player.bankrupt = true
  next.debt = undefined
  addLog(next, `${player.name} saiu da partida.`)
  const remaining = activePlayers(next)
  if (remaining.length === 1) {
    next.phase = 'GAME_OVER'
    next.winnerId = remaining[0].id
    addLog(next, `${remaining[0].name} venceu o Rio!`)
  } else {
    next.phase = 'END'
    next.extraTurn = false
  }
  return next
}

export function trade(state: GameState, offer: TradeOffer) {
  if (!['ROLL', 'END'].includes(state.phase)) return state
  const next = copy(state)
  const from = next.players.find(player => player.id === offer.fromId)
  const to = next.players.find(player => player.id === offer.toId)
  if (!from || !to || from.bankrupt || to.bankrupt || offer.giveCash < 0 || offer.receiveCash < 0 || from.balance < offer.giveCash || to.balance < offer.receiveCash) return state
  const canTrade = (owner: Player, index?: number) => index === undefined || (owner.owned.includes(index) && groupProperties(index).every(item => next.properties[item].houses === 0))
  if (!canTrade(from, offer.giveSpace) || !canTrade(to, offer.receiveSpace)) return state
  from.balance += offer.receiveCash - offer.giveCash
  to.balance += offer.giveCash - offer.receiveCash
  const transfer = (index: number | undefined, source: Player, target: Player) => {
    if (index === undefined) return
    source.owned = source.owned.filter(item => item !== index)
    target.owned.push(index)
    next.properties[index].ownerId = target.id
  }
  transfer(offer.giveSpace, from, to)
  transfer(offer.receiveSpace, to, from)
  addLog(next, `${from.name} e ${to.name} fecharam uma troca.`)
  return next
}
