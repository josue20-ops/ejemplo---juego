'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

const PORT = process.env.PORT || 3000;
const WORLD = { width: 1000, height: 620 };
const PLAYER_RADIUS = 15;
const PLAYER_SPEED = 255;
const PLAYER_MAX_HP = 100;
const BULLET_RADIUS = 5;
const BULLET_SPEED = 610;
const BULLET_DAMAGE = 20;
const FIRE_INTERVAL = 0.27;
const TICK_RATE = 30;
const SNAPSHOT_INTERVAL_MS = 50;

const connectedPlayers = new Map();
const activeMatches = new Map();
let nextMatchNumber = 1;
let previousTick = Date.now();
let previousSnapshot = 0;

app.use(express.static(path.join(__dirname)));
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'caos-online', activePlayers: connectedPlayers.size, activeMatches: activeMatches.size });
});

function emptyInput() {
  return { up: false, down: false, left: false, right: false, fire: false };
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function validName(name) {
  return name.length >= 2 && name.length <= 16 && /^[\p{L}\p{N} _-]+$/u.test(name);
}

// --- NUEVA FUNCIÓN PARA EL LOBBY ---
function broadcastLobbyList() {
  // Filtramos a los jugadores que están registrados, no están jugando y están en estado 'idle'
  const availablePlayers = Array.from(connectedPlayers.values())
    .filter(p => p.registered && p.state === 'idle' && !p.matchId)
    .map(p => ({ id: p.id, name: p.name }));

  // Enviamos la lista a todos los jugadores que están en el lobby (idle)
  for (const [id, player] of connectedPlayers.entries()) {
    if (player.registered && player.state === 'idle' && !player.matchId) {
      // Nos enviamos la lista a nosotros mismos también, para saber cuántos hay
      // pero el cliente filtrará para no mostrarse a sí mismo
      io.to(id).emit('lobby-list', availablePlayers);
    }
  }
}

function publicPlayer(player) {
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    hp: player.hp,
    maxHp: PLAYER_MAX_HP,
    angle: player.angle,
    color: player.color
  };
}

function matchSnapshot(match) {
  return {
    players: match.playerIds
      .map((id) => connectedPlayers.get(id))
      .filter(Boolean)
      .map(publicPlayer),
    bullets: match.bullets.map((bullet) => ({
      x: bullet.x,
      y: bullet.y,
      ownerId: bullet.ownerId,
      color: bullet.color
    }))
  };
}

function emitMatchState(match) {
  if (!match || match.ended) return;
  io.to(match.roomId).emit('match-state', matchSnapshot(match));
}

function finishMatch(match, winnerId, reason = 'finished') {
  if (!match || match.ended) return;
  match.ended = true;
  const winner = winnerId ? connectedPlayers.get(winnerId) : null;
  const otherId = match.playerIds.find((id) => id !== winnerId);
  const loser = otherId ? connectedPlayers.get(otherId) : null;

  io.to(match.roomId).emit('match-over', {
    winnerId: winner ? winner.id : null,
    winnerName: winner ? winner.name : null,
    loserName: loser ? loser.name : null,
    reason
  });

  for (const id of match.playerIds) {
    const player = connectedPlayers.get(id);
    const socket = io.sockets.sockets.get(id);
    if (player) {
      player.matchId = null;
      player.input = emptyInput();
      player.state = 'idle'; // Vuelven al estado idle
    }
    if (socket) socket.leave(match.roomId);
  }
  activeMatches.delete(match.roomId);
  
  // Actualizamos el lobby para todos cuando termina una partida
  broadcastLobbyList(); 
}

function createPlayerState(id, name, side) {
  return {
    id,
    name,
    x: side === 0 ? 145 : WORLD.width - 145,
    y: WORLD.height / 2,
    hp: PLAYER_MAX_HP,
    angle: side === 0 ? 0 : Math.PI,
    color: side === 0 ? '#54f2e8' : '#ff4f91',
    input: emptyInput(),
    fireCooldown: 0,
    matchId: null,
    state: 'playing', // Directamente a jugar
    registered: true
  };
}

function startMatch(firstId, secondId) {
  const first = connectedPlayers.get(firstId);
  const second = connectedPlayers.get(secondId);
  if (!first || !second || !first.registered || !second.registered) return;

  const matchNumber = nextMatchNumber++;
  const roomId = `caos-match-${matchNumber}`;
  const match = {
    roomId,
    playerIds: [firstId, secondId],
    bullets: [],
    nextBulletId: 1,
    ended: false
  };

  Object.assign(first, createPlayerState(firstId, first.name, 0), { matchId: roomId });
  Object.assign(second, createPlayerState(secondId, second.name, 1), { matchId: roomId });
  activeMatches.set(roomId, match);

  const firstSocket = io.sockets.sockets.get(firstId);
  const secondSocket = io.sockets.sockets.get(secondId);
  if (!firstSocket || !secondSocket) {
    finishMatch(match, null, 'connection-lost');
    return;
  }

  firstSocket.join(roomId);
  secondSocket.join(roomId);
  firstSocket.emit('match-found', { roomId, opponentName: second.name });
  secondSocket.emit('match-found', { roomId, opponentName: first.name });
  emitMatchState(match);
  
  // Ocultamos a estos jugadores del lobby de los demás
  broadcastLobbyList();
  
  console.log(`[MATCH] ${first.name} vs ${second.name}`);
}

function updateMatch(match, dt) {
  if (match.ended) return;
  const first = connectedPlayers.get(match.playerIds[0]);
  const second = connectedPlayers.get(match.playerIds[1]);
  if (!first || !second) {
    finishMatch(match, first ? first.id : (second ? second.id : null), 'connection-lost');
    return;
  }

  const participants = [first, second];
  for (const player of participants) {
    const rival = player.id === first.id ? second : first;
    if (player.hp <= 0 || rival.hp <= 0) continue;

    let dx = (player.input.right ? 1 : 0) - (player.input.left ? 1 : 0);
    let dy = (player.input.down ? 1 : 0) - (player.input.up ? 1 : 0);
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }

    player.x = Math.max(PLAYER_RADIUS + 5, Math.min(WORLD.width - PLAYER_RADIUS - 5, player.x + dx * PLAYER_SPEED * dt));
    player.y = Math.max(PLAYER_RADIUS + 5, Math.min(WORLD.height - PLAYER_RADIUS - 5, player.y + dy * PLAYER_SPEED * dt));
    player.angle = Math.atan2(rival.y - player.y, rival.x - player.x);
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);

    if (player.input.fire && player.fireCooldown <= 0) {
      const angle = player.angle;
      match.bullets.push({
        id: match.nextBulletId++,
        ownerId: player.id,
        x: player.x + Math.cos(angle) * (PLAYER_RADIUS + 7),
        y: player.y + Math.sin(angle) * (PLAYER_RADIUS + 7),
        vx: Math.cos(angle) * BULLET_SPEED,
        vy: Math.sin(angle) * BULLET_SPEED,
        ttl: 1.6,
        color: player.color
      });
      player.fireCooldown = FIRE_INTERVAL;
    }
  }

  for (let index = match.bullets.length - 1; index >= 0; index -= 1) {
    const bullet = match.bullets[index];
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    bullet.ttl -= dt;

    if (bullet.ttl <= 0 || bullet.x < -20 || bullet.x > WORLD.width + 20 || bullet.y < -20 || bullet.y > WORLD.height + 20) {
      match.bullets.splice(index, 1);
      continue;
    }

    const target = bullet.ownerId === first.id ? second : first;
    if (!target || target.hp <= 0) {
      match.bullets.splice(index, 1);
      continue;
    }

    const dx = bullet.x - target.x;
    const dy = bullet.y - target.y;
    const radius = PLAYER_RADIUS + BULLET_RADIUS;
    if (dx * dx + dy * dy <= radius * radius) {
      target.hp = Math.max(0, target.hp - BULLET_DAMAGE);
      match.bullets.splice(index, 1);
      if (target.hp <= 0) {
        finishMatch(match, bullet.ownerId, 'eliminated');
        return;
      }
    }
  }
}

io.on('connection', (socket) => {
  connectedPlayers.set(socket.id, {
    id: socket.id,
    name: '',
    registered: false,
    matchId: null,
    state: 'unregistered',
    input: emptyInput()
  });

  socket.on('register-player', (payload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;

    const name = normalizeName(payload && payload.name);
    if (!validName(name)) {
      socket.emit('registration-result', {
        ok: false,
        message: 'El nombre debe tener entre 2 y 16 caracteres y usar solo letras, números, espacios, guion o guion bajo.'
      });
      return;
    }

    const lowerName = name.toLocaleLowerCase();
    const isUsed = Array.from(connectedPlayers.values()).some((other) => {
      return other.id !== socket.id && other.registered && other.name.toLocaleLowerCase() === lowerName;
    });
    if (isUsed) {
      socket.emit('registration-result', { ok: false, message: 'Ese nombre ya está siendo usado por otro jugador conectado. Elige uno diferente.' });
      return;
    }

    player.name = name;
    player.registered = true;
    if (player.state === 'unregistered') player.state = 'idle';
    socket.emit('registration-result', { ok: true, name });
    console.log(`[JOIN] ${name} (${socket.id})`);
    
    // Actualizamos la lista de espera al registrarse
    broadcastLobbyList();
  });

  // --- NUEVO EVENTO PARA RETAR A ALGUIEN ---
  socket.on('challenge-player', (targetId) => {
    const challenger = connectedPlayers.get(socket.id);
    const target = connectedPlayers.get(targetId);

    // Validaciones de seguridad
    if (!challenger || !challenger.registered || challenger.state !== 'idle') return;
    if (!target || !target.registered || target.state !== 'idle' || target.matchId) {
      socket.emit('challenge-error', { message: 'Ese jugador ya no está disponible.' });
      broadcastLobbyList(); // Refrescamos por si acaso
      return;
    }

    // Iniciar la partida inmediatamente
    startMatch(socket.id, targetId);
  });

  socket.on('player-input', (payload) => {
    const player = connectedPlayers.get(socket.id);
    if (!player || !player.matchId || player.state !== 'playing') return;
    const value = payload || {};
    player.input = {
      up: value.up === true,
      down: value.down === true,
      left: value.left === true,
      right: value.right === true,
      fire: value.fire === true
    };
  });

  socket.on('leave-match', () => {
    const player = connectedPlayers.get(socket.id);
    if (!player) return;
    if (player.matchId) {
      const match = activeMatches.get(player.matchId);
      if (match) {
        const opponentId = match.playerIds.find((id) => id !== socket.id);
        finishMatch(match, opponentId && connectedPlayers.has(opponentId) ? opponentId : null, 'player-left');
      }
    }
  });

  socket.on('disconnect', () => {
    const player = connectedPlayers.get(socket.id);
    if (player && player.matchId) {
      const match = activeMatches.get(player.matchId);
      if (match) {
        const opponentId = match.playerIds.find((id) => id !== socket.id);
        finishMatch(match, opponentId && connectedPlayers.has(opponentId) ? opponentId : null, 'connection-lost');
      }
    }
    if (player) console.log(`[LEAVE] ${player.name || socket.id}`);
    connectedPlayers.delete(socket.id);
    
    // Actualizamos el lobby cuando alguien se va
    broadcastLobbyList();
  });
});

setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.05, Math.max(0, (now - previousTick) / 1000));
  previousTick = now;

  for (const match of Array.from(activeMatches.values())) {
    updateMatch(match, dt);
  }

  if (now - previousSnapshot >= SNAPSHOT_INTERVAL_MS) {
    previousSnapshot = now;
    for (const match of activeMatches.values()) emitMatchState(match);
  }
}, 1000 / TICK_RATE);

httpServer.listen(PORT, () => {
  console.log(`CAOS online está listo en http://localhost:${PORT}`);
  console.log('Abre dos ventanas o dos dispositivos para probar el modo 1 contra 1.');
});