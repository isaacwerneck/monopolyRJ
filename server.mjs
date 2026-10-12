import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket, { WebSocketServer } from 'ws'

const root = fileURLToPath(new URL('./dist/', import.meta.url))
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' }
const rooms = new Map()

function code() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let value = ''
  do value = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  while (rooms.has(value))
  return value
}

function send(socket, value) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value))
}

function lobby(room) {
  room.members.forEach((member, seat) => send(member.socket, {
    type: 'lobby', code: room.code, seat, host: seat === 0,
    players: room.members.map(item => ({ name: item.name, online: Boolean(item.socket) })),
  }))
}

function state(room) {
  room.members.forEach((member, seat) => send(member.socket, { type: 'state', game: room.game, seat }))
}

function actorSeat(game) {
  if (game.phase === 'AUCTION' && game.auction) {
    const id = game.auction.active[game.auction.cursor]
    return game.players.findIndex(player => player.id === id)
  }
  return game.current
}

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(req.url?.split('?')[0] || '/').replace(/^\/+/, '')
  const requested = normalize(join(root, pathname))
  let file = requested.startsWith(root) ? requested : join(root, 'index.html')
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html')
  } catch { file = join(root, 'index.html') }
  try {
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8` })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end('Não encontrado')
  }
})

const sockets = new WebSocketServer({ server, path: '/ws' })
sockets.on('connection', socket => {
  let current
  socket.on('message', raw => {
    if (raw.length > 1_000_000) return socket.close(1009)
    let message
    try { message = JSON.parse(raw) } catch { return send(socket, { type: 'error', message: 'Mensagem inválida.' }) }

    if (message.type === 'create') {
      const room = { code: code(), game: null, members: [{ token: message.token, name: String(message.name || 'Jogador').slice(0, 14), socket }] }
      rooms.set(room.code, room); current = room; lobby(room); return
    }
    if (message.type === 'join') {
      const room = rooms.get(String(message.code || '').toUpperCase())
      if (!room) return send(socket, { type: 'error', message: 'Sala não encontrada.' })
      if (room.game) return send(socket, { type: 'error', message: 'Essa partida já começou.' })
      if (room.members.length >= 6) return send(socket, { type: 'error', message: 'A sala está cheia.' })
      room.members.push({ token: message.token, name: String(message.name || 'Jogador').slice(0, 14), socket })
      current = room; lobby(room); return
    }
    if (message.type === 'resume') {
      const room = rooms.get(String(message.code || '').toUpperCase())
      const member = room?.members.find(item => item.token === message.token)
      if (!member) return send(socket, { type: 'error', message: 'A sala não está mais disponível.' })
      member.socket = socket; current = room; room.game ? state(room) : lobby(room); return
    }
    if (!current) return send(socket, { type: 'error', message: 'Entre em uma sala primeiro.' })
    const seat = current.members.findIndex(item => item.socket === socket)
    if (message.type === 'start') {
      if (seat !== 0 || current.members.length < 2 || !message.game) return
      current.game = message.game; state(current); return
    }
    if (message.type === 'state' && actorSeat(current.game) === seat && message.game?.players?.length === current.members.length) {
      current.game = message.game; state(current)
    }
  })
  socket.on('close', () => {
    if (!current) return
    const member = current.members.find(item => item.socket === socket)
    if (member) member.socket = null
    lobby(current)
  })
})

server.listen(4173, '0.0.0.0', () => {
  console.log('RIO disponível em:')
  console.log('  http://localhost:4173')
  Object.values(networkInterfaces()).flat().filter(item => item?.family === 'IPv4' && !item.internal).forEach(item => console.log(`  http://${item.address}:4173`))
})
