import { useState } from 'react'
import Piece from './Piece'

export interface Lobby {
  code: string
  seat: number
  host: boolean
  players: { name: string; online: boolean }[]
}

interface SetupProps {
  onStart: (names: string[]) => void
  hasSave: boolean
  onContinue: () => void
  lobby: Lobby | null
  networkError: string
  onCreateOnline: (name: string) => void
  onJoinOnline: (name: string, code: string) => void
  onStartOnline: () => void
}

export default function Setup({ onStart, hasSave, onContinue, lobby, networkError, onCreateOnline, onJoinOnline, onStartOnline }: SetupProps) {
  const [mode, setMode] = useState<'online' | 'local'>('online')
  const [count, setCount] = useState(2)
  const [names, setNames] = useState(['Iza', 'Convidado', 'Jogador 3', 'Jogador 4', 'Jogador 5', 'Jogador 6'])
  const [onlineName, setOnlineName] = useState('Iza')
  const [roomCode, setRoomCode] = useState('')

  return <main className="setup-screen">
    <section className="setup-copy">
      <p className="eyebrow">JOGO DE TABULEIRO</p><h1>RIO</h1><p>2–6 jogadores</p>
    </section>
    <section className="setup-card glass">
      <div className="mode-switch"><button className={mode === 'online' ? 'active' : ''} onClick={() => setMode('online')}>Em rede</button><button className={mode === 'local' ? 'active' : ''} onClick={() => setMode('local')}>Mesmo notebook</button></div>
      {mode === 'online' ? lobby ? <>
        <div className="lobby-code"><small>CÓDIGO DA SALA</small><strong>{lobby.code}</strong><p>Seu amigo abre este mesmo endereço e usa o código.</p></div>
        <div className="lobby-players">{lobby.players.map((player, index) => <div key={`${player.name}-${index}`} style={{ '--player': `var(--p${index + 1})` } as React.CSSProperties}><Piece index={index}/><b>{player.name}</b><small>{player.online ? 'ONLINE' : 'DESCONECTADO'}</small></div>)}</div>
        {lobby.host ? <button className="primary giant" disabled={lobby.players.length < 2} onClick={onStartOnline}>Começar <span>→</span></button> : <p className="waiting">Esperando quem criou a sala começar.</p>}
      </> : <>
        <div className="setup-heading"><div><p className="eyebrow">MULTIPLAYER</p><h2>Criar ou entrar</h2></div></div>
        <label className="online-field">Seu nome<input value={onlineName} maxLength={14} onChange={event => setOnlineName(event.target.value)} /></label>
        <button className="primary giant" disabled={!onlineName.trim()} onClick={() => onCreateOnline(onlineName.trim())}>Criar sala</button>
        <div className="join-row"><input value={roomCode} maxLength={4} placeholder="CÓDIGO" onChange={event => setRoomCode(event.target.value.toUpperCase())}/><button disabled={!onlineName.trim() || roomCode.length !== 4} onClick={() => onJoinOnline(onlineName.trim(), roomCode)}>Entrar</button></div>
        {networkError && <p className="network-error">{networkError}</p>}
      </> : <>
        <div className="setup-heading"><div><p className="eyebrow">PARTIDA LOCAL</p><h2>Quem vai jogar?</h2></div><strong>{count}</strong></div>
        <input className="range" type="range" min="2" max="6" value={count} onChange={event => setCount(Number(event.target.value))} aria-label="Quantidade de jogadores" />
        <div className="player-fields">{names.slice(0, count).map((name, index) => <label key={index} style={{ '--player': `var(--p${index + 1})` } as React.CSSProperties}><Piece index={index}/><span>JOGADOR {index + 1}</span><input value={name} maxLength={14} onChange={event => setNames(names.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} /></label>)}</div>
        <button className="primary giant" onClick={() => onStart(names.slice(0, count))}>Começar <span>→</span></button>
        {hasSave && <button className="text-button" onClick={onContinue}>Continuar partida salva</button>}
      </>}
    </section>
    <div className="setup-grid" aria-hidden="true" />
  </main>
}
