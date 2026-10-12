import { useEffect, useMemo, useRef, useState } from 'react'
import Board from './components/Board'
import Setup from './components/Setup'
import type { Lobby } from './components/Setup'
import Piece from './components/Piece'
import { spaces } from './game/data'
import {
  build, buyFromPlayer, buyProperty, createGame, declareBankruptcy, declineProperty, declineTakeover, endTurn,
  leaveWait, rentFor, rollDice, sellBuilding, settleDebt, takeoverPrice, toggleMortgage, trade,
} from './game/engine'
import type { GameState, TradeOffer } from './game/types'

const SAVE_KEY = 'rio-tabuleiro-save-v1'

function money(value: number) { return `R$ ${value.toLocaleString('pt-BR')}` }

export default function App() {
  const [game, setGame] = useState<GameState | null>(null)
  const [rolling, setRolling] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [showTrade, setShowTrade] = useState(false)
  const [visualPositions, setVisualPositions] = useState<Record<string, number>>({})
  const [moneyChanges, setMoneyChanges] = useState<Record<string, number>>({})
  const [actionFeedback, setActionFeedback] = useState<{ id: number; text: string; tone: 'good' | 'bad' | 'info' } | null>(null)
  const [lobby, setLobby] = useState<Lobby | null>(null)
  const [networkError, setNetworkError] = useState('')
  const socket = useRef<WebSocket | null>(null)
  const previousBalances = useRef<Record<string, number>>({})
  const previousLog = useRef('')
  const ownedCardsRef = useRef<HTMLDivElement | null>(null)
  const saved = useMemo(() => localStorage.getItem(SAVE_KEY), [])

  useEffect(() => { if (game && !lobby) localStorage.setItem(SAVE_KEY, JSON.stringify(game)) }, [game, lobby])
  useEffect(() => { if (game) window.scrollTo({ top: 0, left: 0 }) }, [Boolean(game)])
  useEffect(() => {
    if (game && !rolling) setVisualPositions(Object.fromEntries(game.players.map(item => [item.id, item.position])))
  }, [game, rolling])
  useEffect(() => {
    if (!game) { previousBalances.current = {}; return }
    const current = Object.fromEntries(game.players.map(item => [item.id, item.balance]))
    const changes: Record<string, number> = {}
    game.players.forEach(item => {
      const change = item.balance - previousBalances.current[item.id]
      if (change && Number.isFinite(change)) changes[item.id] = change
    })
    previousBalances.current = current
    if (!Object.keys(changes).length) return
    setMoneyChanges(changes)
    const timeout = window.setTimeout(() => setMoneyChanges({}), 1800)
    return () => window.clearTimeout(timeout)
  }, [game])
  useEffect(() => {
    if (!game?.log[0]) { previousLog.current = ''; setActionFeedback(null); return }
    const signature = game.log.slice(0, 3).join('\n')
    if (!previousLog.current) { previousLog.current = signature; return }
    if (signature === previousLog.current) return
    previousLog.current = signature
    const text = game.log[0]
    const tone = /pagou|precisa|espera|faliu|hipotecou/.test(text) ? 'bad' : /recebeu|fechou|comprou|melhorou|quitou|venceu|pode melhorar/.test(text) ? 'good' : 'info'
    setActionFeedback({ id: Date.now(), text, tone })
    const timeout = window.setTimeout(() => setActionFeedback(null), 2100)
    return () => window.clearTimeout(timeout)
  }, [game?.log])
  useEffect(() => {
    if (!game || game.phase !== 'END' || buildableIndexes(game).length || game.takeoverOpportunity !== undefined || (lobby && lobby.seat !== game.current)) return
    const current = game.players[game.current]
    const stoppedAtOwnPlace = game.properties[current.position]?.ownerId === current.id
    const timeout = window.setTimeout(() => {
      const next = endTurn(game)
      setGame(next)
      if (lobby && socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'state', game: next }))
    }, stoppedAtOwnPlace ? 1800 : 900)
    return () => window.clearTimeout(timeout)
  }, [game, lobby])
  useEffect(() => {
    const scrollCards = (event: WheelEvent) => {
      const rail = ownedCardsRef.current
      if (window.innerWidth <= 820 || !rail || rail.scrollHeight <= rail.clientHeight || (event.target as Element)?.closest('.modal')) return
      event.preventDefault()
      rail.scrollTop += event.deltaY
    }
    window.addEventListener('wheel', scrollCards, { passive: false })
    return () => window.removeEventListener('wheel', scrollCards)
  }, [])
  const connect = (type: 'create' | 'join', name: string, code?: string) => {
    socket.current?.close()
    setNetworkError('Conectando...')
    const host = location.port === '5173' ? `${location.hostname}:4173` : location.host
    const connection = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`)
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    const timeout = window.setTimeout(() => {
      connection.close()
      setNetworkError('Não foi possível conectar ao servidor na porta 4173.')
    }, 5000)
    socket.current = connection
    connection.onopen = () => connection.send(JSON.stringify({ type, name, code, token }))
    connection.onmessage = event => {
      window.clearTimeout(timeout)
      const message = JSON.parse(event.data)
      if (message.type === 'error') return setNetworkError(message.message)
      if (message.type === 'lobby') { setLobby(message); setNetworkError('') }
      if (message.type === 'state') { setLobby(current => current ? { ...current, seat: message.seat } : current); setGame(message.game); setNetworkError('') }
    }
    connection.onerror = () => { window.clearTimeout(timeout); setNetworkError('Servidor indisponível na porta 4173.') }
  }

  const leaveGame = () => {
    socket.current?.close(); socket.current = null; setLobby(null); setGame(null); setNetworkError('')
  }

  if (!game) return <Setup hasSave={Boolean(saved)} lobby={lobby} networkError={networkError}
    onStart={names => { setLobby(null); setGame(createGame(names)) }} onContinue={() => saved && setGame(JSON.parse(saved))}
    onCreateOnline={name => connect('create', name)} onJoinOnline={(name, code) => connect('join', name, code)}
    onStartOnline={() => lobby && socket.current?.send(JSON.stringify({ type: 'start', game: createGame(lobby.players.map(item => item.name)) }))} />

  const player = game.players[game.current]
  const viewer = lobby ? game.players[lobby.seat] : player
  const pending = game.pendingSpace !== undefined ? spaces[game.pendingSpace] : undefined
  const canAct = !lobby || lobby.seat === game.current
  const buildable = buildableIndexes(game)
  const takeover = game.takeoverOpportunity !== undefined ? spaces[game.takeoverOpportunity] : undefined
  const landedOwn = game.phase === 'END' && game.properties[player.position]?.ownerId === player.id ? spaces[player.position] : undefined
  const commit = (next: GameState) => {
    setGame(next)
    if (lobby && socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'state', game: next }))
  }

  const roll = async () => {
    setRolling(true)
    await new Promise(resolve => window.setTimeout(resolve, 360))
    const next = rollDice(game)
    const actor = game.players[game.current]
    const result = next.players.find(item => item.id === actor.id)!
    const total = next.dice[0] + next.dice[1]
    const rolledTarget = (actor.position + total) % 40
    const sentToWait = result.jailTurns > 0 && result.position === 10
    const steps = sentToWait && rolledTarget !== 30 ? 0 : result.position === actor.position ? 0 : total
    let position = actor.position
    for (let step = 0; step < steps; step += 1) {
      position = (position + 1) % 40
      setVisualPositions(current => ({ ...current, [actor.id]: position }))
      await new Promise(resolve => window.setTimeout(resolve, 90))
    }
    if (position !== result.position) {
      if (sentToWait) {
        setVisualPositions(current => ({ ...current, [actor.id]: result.position }))
        await new Promise(resolve => window.setTimeout(resolve, 180))
      } else {
        const forward = (result.position - position + 40) % 40
        const backward = (position - result.position + 40) % 40
        const direction = forward <= backward ? 1 : -1
        const extraSteps = Math.min(forward, backward)
        for (let step = 0; step < extraSteps; step += 1) {
          position = (position + direction + 40) % 40
          setVisualPositions(current => ({ ...current, [actor.id]: position }))
          await new Promise(resolve => window.setTimeout(resolve, 90))
        }
      }
    }
    commit(next)
    setRolling(false)
  }

  return <main className="game-shell minimal-shell">
    <header className="topbar minimal-topbar">
      <button className="brand" onClick={() => setShowRules(true)}><b>RIO</b></button>
      <div className="player-huds" aria-label="Jogadores">
        {game.players.map((item, index) => <div className={`player-hud ${index === game.current ? 'active' : ''} ${lobby?.seat === index ? 'mine' : ''} ${item.bankrupt ? 'bankrupt' : ''}`} style={{ '--player': item.color } as React.CSSProperties} key={item.id}>
          <Piece index={item.avatar}/><div><small>{lobby?.seat === index ? 'VOCÊ' : index === game.current ? 'JOGANDO' : 'JOGADOR'}</small><b>{item.name}</b></div><strong>{money(item.balance)}</strong>
          {moneyChanges[item.id] && <span className={`money-change ${moneyChanges[item.id] > 0 ? 'gain' : 'loss'}`}>{moneyChanges[item.id] > 0 ? '+' : '−'}{money(Math.abs(moneyChanges[item.id]))}</span>}
        </div>)}
      </div>
      <div className="top-actions"><button onClick={() => setShowRules(true)} aria-label="Como jogar">?</button><button onClick={() => { if (confirm(lobby ? 'Sair da partida?' : 'Começar uma partida nova?')) { localStorage.removeItem(SAVE_KEY); leaveGame() } }}>{lobby ? 'Sair' : 'Nova'}</button></div>
    </header>

    <section className="game-stage">
      <div className="playfield">
      <Board game={game} visualPositions={visualPositions} feedback={actionFeedback} rolling={rolling}/>

      <aside className="action-panel compact-action glass">
        {!canAct && <div className="waiting-turn"><small>AGUARDANDO</small><b>{player.name}</b><p>As jogadas aparecem aqui em tempo real.</p></div>}
        {canAct && <>
        {game.phase === 'ROLL' && (takeover ? <TakeoverPrompt game={game} index={takeover.index} onBuy={() => commit(buyFromPlayer(game))} onDecline={() => commit(declineTakeover(game))}/> : <>
          {buildable.length > 0 && <BuildPrompt game={game} indexes={buildable} onBuild={index => commit(build(game, index))}/>} 
          {player.jailTurns > 0 && <h2>Na espera</h2>}
          {player.jailTurns > 0 && <p>Tentativa {player.jailTurns} de 3</p>}
          {player.jailTurns > 0 && <div className="button-row"><button disabled={player.balance < 50} onClick={() => commit(leaveWait(game))}>Pagar R$ 50</button><button disabled={!player.escapeCards} onClick={() => commit(leaveWait(game, true))}>Usar carta</button></div>}
          <button className="primary giant" disabled={rolling} onClick={roll}>{rolling ? 'Rolando...' : 'Rolar'} <span>◆</span></button>
        </>)}
        {game.phase === 'BUY' && pending && <div className="decision-card property-card" style={{ '--group': pending.color || '#48cae4' } as React.CSSProperties}>
          <div className="card-top"><small>DISPONÍVEL</small><span className="card-mark">◆</span></div><div className="property-art"><i/><i/><i/></div><h2>{pending.name}</h2><strong>{money(pending.price || 0)}</strong>
          <div className="purchase-facts"><span><small>Aluguel inicial</small><b>{pending.rent ? money(pending.rent[0]) : pending.kind === 'rail' ? money(25) : '4× dados'}</b></span><span><small>Melhoria</small><b>{pending.houseCost ? money(pending.houseCost) : 'Não possui'}</b></span></div>
          <div className="purchase-actions"><button className="primary wide" disabled={player.balance < (pending.price || 0)} onClick={() => commit(buyProperty(game))}>Comprar</button><button className="secondary wide" onClick={() => commit(declineProperty(game))}>Não comprar</button></div>
        </div>}
        {game.phase === 'END' && (takeover ? <TakeoverPrompt game={game} index={takeover.index} onBuy={() => commit(buyFromPlayer(game))} onDecline={() => commit(declineTakeover(game))}/> : buildable.length ? <BuildPrompt game={game} indexes={buildable} onBuild={index => commit(build(game, index))} onDone={() => commit(endTurn(game))}/> : landedOwn ? <div className="own-stop"><small>SEU LUGAR</small><b>{landedOwn.name}</b><p>{constructionHint(game, landedOwn.index)}</p><div className="auto-turn"><i/><span>Passando o turno</span></div></div> : <div className="auto-turn"><i/><span>Passando o turno</span></div>)}
        {game.phase === 'DEBT' && game.debt && <div className="decision-card debt-card"><small>DÍVIDA PENDENTE</small><h2>{money(game.debt.amount)}</h2><p>Hipoteque pontos ou venda melhorias para levantar a grana.</p><button className="primary wide" disabled={player.balance < game.debt.amount} onClick={() => commit(settleDebt(game))}>Quitar dívida</button><button className="danger wide" onClick={() => commit(declareBankruptcy(game))}>Declarar falência</button></div>}
        {game.phase === 'GAME_OVER' && <div className="winner"><span>★</span><small>MANDOU NO RIO</small><h2>{game.players.find(item => item.id === game.winnerId)?.name}</h2><button className="primary wide" onClick={leaveGame}>Jogar de novo</button></div>}
        </>}
        {game.lastCard && <div className="drawn-card"><div className="card-top"><small>EVENTO</small><span className="card-mark">?</span></div><p>{game.lastCard}</p></div>}
      </aside>
      </div>

      <aside className="owned-rail">
        <div className="owned-heading"><div><small>MINHAS CARTAS</small><b>{viewer.name}</b></div>{viewer.owned.length > 0 && <button disabled={!canAct || !['ROLL', 'END'].includes(game.phase)} onClick={() => setShowTrade(true)}>Trocar</button>}</div>
        <div className="owned-cards" ref={ownedCardsRef}>{viewer.owned.length === 0 && <p className="empty-owned">Você ainda não comprou nenhum lugar.</p>}{viewer.owned.map(index => <OwnedCard game={game} index={index} canManage={canAct && ['ROLL', 'END', 'DEBT'].includes(game.phase)} onBuild={() => commit(build(game, index))} onSell={() => commit(sellBuilding(game, index))} onMortgage={() => commit(toggleMortgage(game, index))} key={index}/>)}</div>
      </aside>

    </section>

    {showRules && <Rules onClose={() => setShowRules(false)}/>} 
    {showTrade && <TradeModal game={game} onClose={() => setShowTrade(false)} onTrade={offer => { commit(trade(game, offer)); setShowTrade(false) }}/>} 
  </main>
}

function canBuildOn(game: GameState, index: number) {
  const space = spaces[index]
  const property = game.properties[index]
  const player = game.players[game.current]
  return space.kind === 'property' && game.buildOpportunity === index && property.ownerId === player.id && !property.mortgaged && property.houses < 5 && player.balance >= (space.houseCost || 0)
}

function buildableIndexes(game: GameState) {
  return game.buildOpportunity !== undefined && canBuildOn(game, game.buildOpportunity) ? [game.buildOpportunity] : []
}

function constructionHint(game: GameState, index: number) {
  const space = spaces[index]
  if (space.kind !== 'property') return 'Este lugar não recebe casas.'
  const player = game.players[game.current]
  const property = game.properties[index]
  if (property.houses >= 5) return 'Este lugar já tem hotel.'
  if (game.buildOpportunity !== index) return 'Melhoria concluída.'
  if (property.mortgaged) return 'Quite a hipoteca para construir.'
  if (player.balance < (space.houseCost || 0)) return `Você precisa de ${money(space.houseCost || 0)} para a próxima casa.`
  return 'Você pode colocar uma casa nesta parada.'
}

function BuildPrompt({ game, indexes, onBuild, onDone }: { game: GameState; indexes: number[]; onBuild: (index: number) => void; onDone?: () => void }) {
  return <div className="build-prompt"><small>CONSTRUIR</small>{indexes.map(index => <button onClick={() => onBuild(index)} key={index}><span>{spaces[index].name}</span><b>+ {game.properties[index].houses === 4 ? 'Hotel' : 'Casa'} · {money(spaces[index].houseCost || 0)}</b></button>)}{onDone && <button className="secondary wide" onClick={onDone}>Agora não</button>}</div>
}

function TakeoverPrompt({ game, index, onBuy, onDecline }: { game: GameState; index: number; onBuy: () => void; onDecline: () => void }) {
  const space = spaces[index]
  const property = game.properties[index]
  const owner = game.players.find(player => player.id === property.ownerId)!
  const price = takeoverPrice(game, index)
  return <div className="takeover-prompt" style={{ '--group': space.color || owner.color } as React.CSSProperties}>
    <small>PROPOSTA DIRETA</small><h2>{space.name}</h2><p>Comprar de <b>{owner.name}</b>{property.houses > 0 ? ` com ${property.houses === 5 ? 'hotel' : `${property.houses} casa${property.houses > 1 ? 's' : ''}`}` : ''}.{property.mortgaged ? ' O imóvel está hipotecado.' : ''}</p>
    <div><span>Valor de compra</span><strong>{money(price)}</strong></div>
    <button className="primary wide" disabled={game.players[game.current].balance < price} onClick={onBuy}>{game.players[game.current].balance < price ? 'Saldo insuficiente' : 'Comprar do jogador'}</button>
    <button className="secondary wide" onClick={onDecline}>Agora não</button>
  </div>
}

function RentTable({ rent, houseCost, level = -1 }: { rent?: number[]; houseCost?: number; level?: number }) {
  if (!rent) return <div className="rent-variable"><span>Aluguel</span><b>Valor variável</b></div>
  const labels = ['Sem casa', '1 casa', '2 casas', '3 casas', '4 casas', 'Hotel']
  return <div className="rent-table">
    {rent.map((value, index) => <span className={index === level ? 'active' : ''} key={index}><small>{labels[index]}</small><b>{money(value)}</b></span>)}
    {houseCost && <p>Cada casa ou hotel custa <b>{money(houseCost)}</b></p>}
  </div>
}

function OwnedCard({ game, index, canManage, onBuild, onSell, onMortgage }: { game: GameState; index: number; canManage: boolean; onBuild: () => void; onSell: () => void; onMortgage: () => void }) {
  const space = spaces[index]
  const property = game.properties[index]
  const canBuild = canManage && canBuildOn(game, index)
  const canSell = canManage && property.houses > 0
  return <article className={`owned-card ${property.mortgaged ? 'is-mortgaged' : ''}`} style={{ '--group': space.color || '#777' } as React.CSSProperties}>
    <div className="owned-card-art"><i/><i/><i/></div>
    <div className="owned-card-title"><div><small>{space.kind === 'property' ? 'LUGAR' : space.kind === 'rail' ? 'TRANSPORTE' : 'SERVIÇO'}</small><b>{space.name}</b></div><strong>{property.houses === 5 ? 'HOTEL' : property.houses ? `${property.houses} CASA${property.houses > 1 ? 'S' : ''}` : 'SEM CASA'}</strong></div>
    <div className="rent-now"><span>Aluguel atual</span><b>{money(rentFor(game, index))}</b></div>
    <RentTable rent={space.rent} houseCost={space.houseCost} level={property.houses}/>
    {space.kind === 'property' && <div className="build-actions"><button disabled={!canBuild} onClick={onBuild}>+ {property.houses === 4 ? 'Hotel' : 'Casa'}</button><button disabled={!canSell} onClick={onSell}>− Vender</button></div>}
    <button className="mortgage-action" disabled={!canManage || property.houses > 0} onClick={onMortgage}>{property.mortgaged ? 'Quitar hipoteca' : `Hipotecar por ${money(Math.floor((space.price || 0) / 2))}`}</button>
  </article>
}

function Rules({ onClose }: { onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal rules-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
    <button className="close" onClick={onClose}>×</button><p className="eyebrow">REGRAS</p><h2>Como jogar</h2>
    <ol><li><b>Jogue os dados.</b> Ande e resolva a casa onde parar.</li><li><b>Compre lugares.</b> Ao comprar, você pode adicionar a primeira casa.</li><li><b>Volte aos seus lugares.</b> Cada nova parada permite comprar mais uma casa.</li><li><b>Compre do rival.</b> Ao parar num lugar de outro jogador, pague o aluguel e pode comprá-lo por 150% do valor, mais o custo integral das melhorias.</li><li><b>Chegue ao hotel.</b> Depois de quatro casas, a próxima melhoria vira hotel.</li><li><b>Negocie e hipoteque.</b> Use seu patrimônio para sobreviver às dívidas.</li><li><b>Fique por último.</b> O último jogador sem falir vence.</li></ol>
    <p className="rules-note">Duplas dão outra jogada; três duplas seguidas mandam para a espera. Na espera, tire uma dupla, use uma carta ou pague R$ 50.</p>
  </section></div>
}

function TradeModal({ game, onClose, onTrade }: { game: GameState; onClose: () => void; onTrade: (offer: TradeOffer) => void }) {
  const from = game.players[game.current]
  const candidates = game.players.filter(player => !player.bankrupt && player.id !== from.id)
  const [toId, setToId] = useState(candidates[0]?.id || '')
  const [giveSpace, setGiveSpace] = useState('')
  const [receiveSpace, setReceiveSpace] = useState('')
  const [giveCash, setGiveCash] = useState(0)
  const [receiveCash, setReceiveCash] = useState(0)
  const to = game.players.find(player => player.id === toId)
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal trade-modal" role="dialog" aria-modal="true" onMouseDown={event => event.stopPropagation()}>
    <button className="close" onClick={onClose}>×</button><p className="eyebrow">NEGOCIAÇÃO LOCAL</p><h2>Fazer uma troca</h2>
    <label>Negociar com<select value={toId} onChange={event => { setToId(event.target.value); setReceiveSpace('') }}>{candidates.map(player => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>
    <div className="trade-columns"><div><h3>Você oferece</h3><select value={giveSpace} onChange={event => setGiveSpace(event.target.value)}><option value="">Nenhum ponto</option>{from.owned.map(index => <option value={index} key={index}>{spaces[index].name}</option>)}</select><label>Dinheiro<input type="number" min="0" max={from.balance} value={giveCash} onChange={event => setGiveCash(Math.max(0, Number(event.target.value)))} /></label></div>
    <div><h3>Você recebe</h3><select value={receiveSpace} onChange={event => setReceiveSpace(event.target.value)}><option value="">Nenhum ponto</option>{to?.owned.map(index => <option value={index} key={index}>{spaces[index].name}</option>)}</select><label>Dinheiro<input type="number" min="0" max={to?.balance || 0} value={receiveCash} onChange={event => setReceiveCash(Math.max(0, Number(event.target.value)))} /></label></div></div>
    <button className="primary wide" disabled={!toId || (!giveSpace && !receiveSpace && !giveCash && !receiveCash)} onClick={() => onTrade({ fromId: from.id, toId, giveSpace: giveSpace ? Number(giveSpace) : undefined, receiveSpace: receiveSpace ? Number(receiveSpace) : undefined, giveCash, receiveCash })}>Confirmar com os jogadores</button>
    <p className="modal-hint">Como a partida é local, a confirmação representa o acordo feito entre vocês.</p>
  </section></div>
}
