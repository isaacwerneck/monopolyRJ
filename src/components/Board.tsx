import { spaces } from '../game/data'
import type { GameState, Space } from '../game/types'
import Dice from './Dice'
import Piece from './Piece'

function position(index: number) {
  if (index <= 10) return { gridRow: 11, gridColumn: 11 - index }
  if (index <= 20) return { gridRow: 21 - index, gridColumn: 1 }
  if (index <= 30) return { gridRow: 1, gridColumn: index - 19 }
  return { gridRow: index - 29, gridColumn: 11 }
}

function icon(space: Space) {
  return ({ go: '↗', chance: '?', chest: '◆', tax: 'R$', rail: '▰', utility: '⚡', jail: '◫', free: '✦', gotojail: '⇥' } as Record<string, string>)[space.kind]
}

export default function Board({ game, visualPositions = {}, feedback, rolling = false }: { game: GameState; visualPositions?: Record<string, number>; feedback?: { id: number; text: string; tone: 'good' | 'bad' | 'info' } | null; rolling?: boolean }) {
  const current = game.players[game.current]
  return <div className="board-wrap">
    <div className="board" aria-label="Tabuleiro do Rio">
      <div className="board-center">
        <Dice values={game.dice} rolling={rolling}/>
        <p>Rodada {game.turn}</p>
        {feedback && <div className={`action-feedback ${feedback.tone}`} key={feedback.id} role="status">{feedback.text}</div>}
      </div>
      {spaces.map(space => {
        const property = game.properties[space.index]
        const owner = property?.ownerId ? game.players.find(player => player.id === property.ownerId) : undefined
        const players = game.players.filter(player => !player.bankrupt && (visualPositions[player.id] ?? player.position) === space.index)
        const isCurrent = (visualPositions[current.id] ?? current.position) === space.index
        return <div
          className={`space space-${space.kind} ${space.index % 10 === 0 ? 'corner' : ''} ${game.pendingSpace === space.index ? 'pending' : ''} ${game.buildOpportunity === space.index ? 'build-ready' : ''} ${isCurrent ? 'current-space' : ''}`}
          style={{ ...position(space.index), '--group': space.color || '#1d1835' } as React.CSSProperties}
          key={space.index}
          title={space.name}
        >
          {space.color && <b className="color-bar" />}
          {owner && <span className="owner-dot" style={{ background: owner.color }} title={`De ${owner.name}`} />}
          <span className="space-icon">{icon(space)}</span>
          <span className="space-name">{space.name}</span>
          {space.price && <small>R$ {space.price}</small>}
          {property?.houses > 0 && <span className="buildings" aria-label={property.houses === 5 ? 'Hotel' : `${property.houses} casas`}>
            {property.houses === 5 ? <i className="hotel" /> : Array.from({ length: property.houses }, (_, index) => <i className="house" key={index} />)}
          </span>}
          {property?.mortgaged && <span className="mortgaged">H</span>}
          {space.index % 10 === 0 && <span className="direction" aria-hidden="true">{({ 0: '←', 10: '↑', 20: '→', 30: '↓' } as Record<number, string>)[space.index]}</span>}
          <div className="tokens">
            {players.map(player => <span className={`token ${player.id === current.id ? 'is-current' : ''}`} style={{ '--player': player.color } as React.CSSProperties} key={player.id}><Piece index={player.avatar} /></span>)}
          </div>
        </div>
      })}
    </div>
  </div>
}
