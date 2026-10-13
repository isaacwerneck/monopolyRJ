import { describe, expect, it } from 'vitest'
import { auctionBid, auctionPass, build, buyFromPlayer, buyProperty, createGame, declareBankruptcy, declineProperty, rentFor, rollDice, settleDebt, startAuction, takeoverPrice, toggleMortgage, trade } from './engine'

describe('motor do Rio', () => {
  it('move, paga a volta e oferece uma propriedade', () => {
    let game = createGame(['Ana', 'Beto'])
    game.players[0].position = 39
    game = rollDice(game, [1, 1])
    expect(game.players[0].position).toBe(1)
    expect(game.players[0].balance).toBe(1700)
    expect(game.phase).toBe('BUY')
  })

  it('compra e cobra aluguel dobrado com o grupo completo', () => {
    let game = createGame(['Ana', 'Beto'])
    game.pendingSpace = 1
    game.phase = 'BUY'
    game = buyProperty(game)
    expect(game.buildOpportunity).toBe(1)
    game.current = 0
    game.pendingSpace = 3
    game.phase = 'BUY'
    game = buyProperty(game)
    expect(rentFor(game, 1)).toBe(4)
  })

  it('transfere o aluguel para o dono quando outro jogador cai no lugar', () => {
    let game = createGame(['Ana', 'Beto'])
    game.properties[3].ownerId = 'p2'
    game.players[1].owned = [3]
    game.players[0].position = 1
    game = rollDice(game, [1, 1])
    expect(game.players[0].balance).toBe(1496)
    expect(game.players[1].balance).toBe(1504)
    expect(game.log[0]).toContain('pagou R$ 4 de aluguel')
    expect(game.log[0]).toContain('para Beto')
  })

  it('transfere o aluguel ao proprietário depois de quitar uma dívida', () => {
    let game = createGame(['Ana', 'Beto'])
    game.players[0].balance = 100
    game.properties[3] = { ownerId: 'p2', houses: 3, mortgaged: false }
    game.players[1].owned = [3]
    game.players[0].position = 1
    game = rollDice(game, [1, 1])
    expect(game.phase).toBe('DEBT')
    expect(game.players[1].balance).toBe(1500)
    game.players[0].balance = 180
    game = settleDebt(game)
    expect(game.players[0].balance).toBe(0)
    expect(game.players[1].balance).toBe(1680)
    expect(game.log[0]).toContain('com Beto')
  })

  it('cobra o aluguel maior correspondente às casas construídas', () => {
    let game = createGame(['Ana', 'Beto'])
    game.properties[3].ownerId = 'p2'
    game.properties[3].houses = 3
    game.players[1].owned = [3]
    game.players[0].position = 1
    game = rollDice(game, [1, 1])
    expect(game.players[0].balance).toBe(1320)
    expect(game.players[1].balance).toBe(1680)
  })

  it('permite comprar do rival com ágio e valor das melhorias', () => {
    let game = createGame(['Ana', 'Beto'])
    game.properties[3].ownerId = 'p2'
    game.properties[3].houses = 2
    game.players[1].owned = [3]
    game.players[0].position = 1
    game = rollDice(game, [1, 1])
    expect(game.takeoverOpportunity).toBe(3)
    expect(takeoverPrice(game, 3)).toBe(190)
    game = buyFromPlayer(game)
    expect(game.properties[3]).toMatchObject({ ownerId: 'p1', houses: 2 })
    expect(game.takeoverOpportunity).toBeUndefined()
    expect(game.players[0].owned).toContain(3)
    expect(game.players[1].owned).not.toContain(3)
    expect(game.players[0].balance).toBe(1250)
    expect(game.players[1].balance).toBe(1750)
  })

  it('não cobra aluguel hipotecado, mas permite proposta de compra', () => {
    let game = createGame(['Ana', 'Beto'])
    game.properties[3] = { ownerId: 'p2', houses: 0, mortgaged: true }
    game.players[1].owned = [3]
    game.players[0].position = 1
    game = rollDice(game, [1, 1])
    expect(game.players.map(player => player.balance)).toEqual([1500, 1500])
    expect(game.takeoverOpportunity).toBe(3)
  })

  it('rejeita dinheiro negativo em uma troca', () => {
    const game = createGame(['Ana', 'Beto'])
    const result = trade(game, { fromId: 'p1', toId: 'p2', giveCash: -100, receiveCash: 0 })
    expect(result).toBe(game)
  })

  it('permite uma casa ao comprar ou cair novamente em um lugar próprio', () => {
    let game = createGame(['Ana', 'Beto'])
    game.players[0].owned = [1]
    game.properties[1].ownerId = 'p1'
    game.buildOpportunity = 1
    game = build(game, 1)
    expect(game.properties[1].houses).toBe(1)
    expect(game.buildOpportunity).toBeUndefined()
    const unchanged = build(game, 1)
    expect(unchanged.properties[1].houses).toBe(1)
    expect(toggleMortgage(game, 1).properties[1].mortgaged).toBe(false)

    game.players[0].position = 39
    game = rollDice(game, [2, 2])
    expect(game.players[0].position).toBe(3)
    game.players[0].owned.push(3)
    game.properties[3].ownerId = 'p1'
    game.players[0].position = 1
    game.phase = 'ROLL'
    game = rollDice(game, [1, 1])
    expect(game.buildOpportunity).toBe(3)
  })

  it('manda para a espera na terceira dupla', () => {
    let game = createGame(['Ana', 'Beto'])
    game.doubles = 2
    game = rollDice(game, [4, 4])
    expect(game.players[0].position).toBe(10)
    expect(game.players[0].jailTurns).toBe(1)
  })

  it('leiloa a propriedade recusada entre todos os jogadores', () => {
    let game = createGame(['Ana', 'Beto'])
    game.phase = 'BUY'
    game.pendingSpace = 1
    game = startAuction(game)
    game = auctionBid(game, 50)
    game = auctionPass(game)
    expect(game.properties[1].ownerId).toBe('p1')
    expect(game.players[0].balance).toBe(1450)
  })

  it('permite recusar uma propriedade sem iniciar leilão', () => {
    let game = createGame(['Ana', 'Beto'])
    game.phase = 'BUY'
    game.pendingSpace = 1
    game = declineProperty(game)
    expect(game.pendingSpace).toBeUndefined()
    expect(game.phase).toBe('END')
  })

  it('transfere os bens ao credor na falência', () => {
    let game = createGame(['Ana', 'Beto'])
    game.players[0].owned = [1]
    game.properties[1].ownerId = 'p1'
    game.phase = 'DEBT'
    game.debt = { amount: 2000, creditorId: 'p2', reason: 'de aluguel' }
    game = declareBankruptcy(game)
    expect(game.properties[1].ownerId).toBe('p2')
    expect(game.winnerId).toBe('p2')
  })
})
