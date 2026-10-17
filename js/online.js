// Cliente del modo online 1 contra 1. Socket.IO comunica este navegador con server.js.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const canvas = $('onlineCanvas');
  const ctx = canvas.getContext('2d');
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const onlineScreen = $('onlineScreen');
  const lobby = $('onlineLobby');
  const matchPanel = $('onlineMatchPanel');
  const resultOverlay = $('onlineResultOverlay');
  const keys = new Set();
  const input = { up: false, down: false, left: false, right: false, fire: false };

  let socket = null;
  let isRegistered = false;
  let isSearching = false;
  let isPlaying = false;
  let latestState = null;
  let ownId = null;
  let joystickActive = false;
  let joystickPointerId = null;
  let lastRenderTime = 0;
  let animationTime = 0;
  let lastConnectionError = '';

  const directions = {
    w: 'up', arrowup: 'up',
    s: 'down', arrowdown: 'down',
    a: 'left', arrowleft: 'left',
    d: 'right', arrowright: 'right'
  };

  // --- NUEVO: Contenedor dinámico para la lista de jugadores buscando ---
  const queueContainer = document.createElement('div');
  queueContainer.id = 'queue-list-container';
  queueContainer.style.marginTop = '15px';
  queueContainer.style.padding = '10px';
  queueContainer.style.background = 'rgba(0,0,0,0.4)';
  queueContainer.style.borderRadius = '6px';
  queueContainer.style.border = '1px solid rgba(255,255,255,0.1)';
  queueContainer.style.display = 'none';
  
  const queueTitle = document.createElement('p');
  queueTitle.textContent = 'Jugadores buscando partida (Haz clic para retar):';
  queueTitle.style.fontSize = '0.9rem';
  queueTitle.style.marginBottom = '10px';
  queueTitle.style.color = '#54f2e8';
  
  const queueList = document.createElement('ul');
  queueList.style.listStyle = 'none';
  queueList.style.padding = '0';
  queueList.style.margin = '0';
  
  queueContainer.appendChild(queueTitle);
  queueContainer.appendChild(queueList);
  
  // Insertamos la lista justo debajo de los botones de buscar/cancelar
  if ($('cancelQueueBtn')) {
    $('cancelQueueBtn').parentNode.insertBefore(queueContainer, $('cancelQueueBtn').nextSibling);
  }

  function setConnection(message, isGood = false) {
    const el = $('onlineConnection');
    el.textContent = message;
    el.classList.toggle('connected', isGood);
  }

  function setMessage(message) {
    $('onlineMessage').textContent = message;
  }

  function updateSearchButtons() {
    $('findMatchBtn').disabled = !isRegistered || isSearching || isPlaying;
    $('cancelQueueBtn').classList.toggle('hidden', !isSearching);
    
    // Mostrar u ocultar la lista de jugadores en cola
    if (isSearching) {
      queueContainer.style.display = 'block';
    } else {
      queueContainer.style.display = 'none';
      queueList.innerHTML = ''; // Limpiar lista
    }
  }

  function resetInput() {
    Object.keys(input).forEach((key) => { input[key] = false; });
    keys.clear();
    sendInput();
  }

  function sendInput() {
    if (socket && socket.connected && isPlaying) {
      socket.emit('player-input', { ...input });
    }
  }

  function setInputDirection(direction, value) {
    input[direction] = value;
    sendInput();
  }

  function registerCurrentName() {
    if (!socket || !socket.connected) return;
    const playerName = String(window.CAOS_PLAYER_NAME || '').trim();
    if (!playerName) {
      setMessage('Primero debes elegir tu nombre en la pantalla inicial.');
      return;
    }
    socket.emit('register-player', { name: playerName });
  }

  function ensureConnection() {
    if (socket && socket.connected) {
      if (!isRegistered) registerCurrentName();
      return;
    }

    if (typeof window.io !== 'function') {
      setConnection('Servidor no disponible', false);
      setMessage('No se detectó el servidor online.');
      $('findMatchBtn').disabled = true;
      return;
    }

    if (socket) {
      socket.disconnect();
      socket = null;
    }

    isRegistered = false;
    isSearching = false;
    isPlaying = false;
    setConnection('Conectando al servidor…', false);
    setMessage('Conectando al servidor de partidas…');
    updateSearchButtons();

    socket = window.io({ reconnection: true, timeout: 7000 });

    socket.on('connect', () => {
      ownId = socket.id;
      setConnection('Conectado al servidor', true);
      registerCurrentName();
    });

    socket.on('registration-result', (data) => {
      if (!data || !data.ok) {
        isRegistered = false;
        setConnection('Nombre no disponible', false);
        setMessage((data && data.message) || 'No se pudo registrar ese nombre.');
        updateSearchButtons();
        return;
      }

      isRegistered = true;
      if (data.name) {
        window.CAOS_PLAYER_NAME = data.name;
        $('onlineCurrentName').textContent = data.name;
        $('displayNameMenu').textContent = data.name;
      }
      setConnection('Conectado al servidor', true);
      setMessage('Listo. Busca un rival para iniciar una partida.');
      updateSearchButtons();
    });

    socket.on('queue-status', (data) => {
      if (!data) return;
      if (data.status === 'waiting') {
        isSearching = true;
        isPlaying = false;
        setMessage('Buscando rival… Selecciona a alguien de la lista o espera.');
      } else if (data.status === 'cancelled') {
        isSearching = false;
        setMessage('Búsqueda cancelada.');
      } else if (data.status === 'error') {
        isSearching = false;
        setMessage(data.message || 'No se pudo buscar una partida.');
      }
      updateSearchButtons();
    });

    // --- NUEVO: Recibir y renderizar la lista de la cola ---
    socket.on('queue-list', (players) => {
      if (!isSearching) return;
      
      queueList.innerHTML = '';
      const otherPlayers = players.filter(p => p.id !== ownId);

      if (otherPlayers.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'Nadie más está buscando partida aún...';
        li.style.fontSize = '0.85rem';
        li.style.color = '#aaa';
        queueList.appendChild(li);
      } else {
        otherPlayers.forEach(player => {
          const li = document.createElement('li');
          li.style.marginBottom = '6px';
          
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'small-btn';
          btn.style.width = '100%';
          btn.style.display = 'flex';
          btn.style.justifyContent = 'space-between';
          btn.innerHTML = `<span>${player.name}</span> <span style="color:#ff4f91">⚔️ Retar</span>`;
          
          btn.addEventListener('click', () => {
            btn.innerHTML = `<span>${player.name}</span> <span style="color:#aaa">Retando...</span>`;
            btn.disabled = true;
            socket.emit('challenge-player', player.id);
            
            // Si el servidor no responde con match-found en 3s, reactivar
            setTimeout(() => { 
              btn.innerHTML = `<span>${player.name}</span> <span style="color:#ff4f91">⚔️ Retar</span>`; 
              btn.disabled = false; 
            }, 3000);
          });

          li.appendChild(btn);
          queueList.appendChild(li);
        });
      }
    });

    socket.on('challenge-error', (data) => {
      alert(data.message);
      // Forzar actualización de la lista
      if (isSearching && socket.connected) socket.emit('find-match');
    });

    socket.on('match-found', (data) => {
      isSearching = false;
      isPlaying = true;
      latestState = null;
      resetInput();
      $('onlineResultOverlay').classList.add('hidden');
      lobby.classList.add('hidden');
      matchPanel.classList.remove('hidden');
      setMessage('Partida encontrada. ¡Buena suerte!');
      if (data && data.opponentName) $('onlineRivalName').textContent = data.opponentName;
      $('onlineMeName').textContent = window.CAOS_PLAYER_NAME || 'Jugador';
      updateSearchButtons();
      setConnection('Partida en curso', true);
    });

    socket.on('match-state', (data) => {
      latestState = data;
      updateScoreboard(data);
    });

    socket.on('match-over', (data) => {
      isPlaying = false;
      isSearching = false;
      resetInput();
      updateSearchButtons();
      const winnerId = data ? data.winnerId : null;
      const winnerName = data && data.winnerName ? data.winnerName : 'Nadie';
      const isWinner = winnerId && winnerId === ownId;
      $('onlineResultSymbol').textContent = isWinner ? '🏆' : '☠';
      $('onlineResultTitle').innerHTML = isWinner ? '¡HAS <span class="accent">GANADO!</span>' : 'HAS <span class="accent">PERDIDO.</span>';
      $('onlineResultText').textContent = winnerId ? `Ganador: ${winnerName}. Puedes buscar otro rival cuando quieras.` : 'La partida terminó sin ganador.';
      resultOverlay.classList.remove('hidden');
      setConnection('Partida finalizada', false);
      setMessage('La partida terminó.');
    });

    socket.on('player-left', (data) => {
      setMessage((data && data.message) || 'El otro jugador salió de la partida.');
    });

    socket.on('connect_error', () => {
      isRegistered = false;
      setConnection('No se puede conectar', false);
      if (!lastConnectionError) {
        setMessage('No se pudo conectar. Comprueba que server.js siga ejecutándose.');
        lastConnectionError = 'connect_error';
      }
      updateSearchButtons();
    });

    socket.on('disconnect', () => {
      isRegistered = false;
      isSearching = false;
      isPlaying = false;
      resetInput();
      setConnection('Desconectado', false);
      if (!onlineScreen.classList.contains('hidden')) {
        setMessage('Se perdió la conexión con el servidor.');
      }
      updateSearchButtons();
    });
  }

  function openOnline() {
    onlineScreen.classList.remove('hidden');
    onlineScreen.setAttribute('aria-hidden', 'false');
    document.body.classList.add('online-active');
    $('startOverlay').classList.add('hidden');
    $('onlineCurrentName').textContent = window.CAOS_PLAYER_NAME || '---';
    lobby.classList.remove('hidden');
    matchPanel.classList.add('hidden');
    resultOverlay.classList.add('hidden');
    lastConnectionError = '';
    ensureConnection();
  }

  function closeOnline() {
    resetInput();
    if (socket) {
      try {
        socket.emit('cancel-matchmaking');
        socket.emit('leave-match');
        socket.disconnect();
      } catch (_) {}
      socket = null;
    }
    isRegistered = false;
    isSearching = false;
    isPlaying = false;
    latestState = null;
    onlineScreen.classList.add('hidden');
    onlineScreen.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('online-active');
    lobby.classList.remove('hidden');
    matchPanel.classList.add('hidden');
    resultOverlay.classList.add('hidden');
    $('startOverlay').classList.remove('hidden');
    setConnection('Desconectado', false);
  }

  function searchForMatch() {
    if (!socket || !socket.connected || !isRegistered) {
      setMessage('Aún no hay conexión válida con el servidor.');
      ensureConnection();
      return;
    }
    resetInput();
    resultOverlay.classList.add('hidden');
    matchPanel.classList.add('hidden');
    lobby.classList.remove('hidden');
    isPlaying = false;
    isSearching = true;
    setMessage('Buscando rival… Selecciona a alguien de la lista o espera.');
    updateSearchButtons();
    socket.emit('find-match');
  }

  function cancelSearch() {
    if (socket && socket.connected) socket.emit('cancel-matchmaking');
    isSearching = false;
    setMessage('Búsqueda cancelada.');
    updateSearchButtons();
  }

  function updateScoreboard(data) {
    if (!data || !Array.isArray(data.players)) return;
    const me = data.players.find((p) => p.id === ownId);
    const rival = data.players.find((p) => p.id !== ownId);
    if (me) {
      $('onlineMeName').textContent = me.name;
      $('onlineMeHp').textContent = `${Math.max(0, Math.ceil(me.hp))} / ${me.maxHp}`;
      $('onlineMeHealth').style.width = `${Math.max(0, Math.min(100, me.hp / me.maxHp * 100))}%`;
    }
    if (rival) {
      $('onlineRivalName').textContent = rival.name;
      $('onlineRivalHp').textContent = `${Math.max(0, Math.ceil(rival.hp))} / ${rival.maxHp}`;
      $('onlineRivalHealth').style.width = `${Math.max(0, Math.min(100, rival.hp / rival.maxHp * 100))}%`;
    }
  }

  function drawBackground() {
    ctx.fillStyle = '#080d1b';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const gradient = ctx.createRadialGradient(WIDTH * 0.5, HEIGHT * 0.5, 20, WIDTH * 0.5, HEIGHT * 0.5, 700);
    gradient.addColorStop(0, '#15203c');
    gradient.addColorStop(1, '#060a14');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = 'rgba(91,130,199,.12)';
    ctx.lineWidth = 1;
    const gridSize = 42;
    const offset = (animationTime * 8) % gridSize;
    for (let x = -gridSize + offset; x < WIDTH; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
    }
    for (let y = -gridSize + offset; y < HEIGHT; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(84,242,232,.22)';
    ctx.strokeRect(12, 12, WIDTH - 24, HEIGHT - 24);
  }

  function drawPlayer(player) {
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.shadowBlur = 24;
    ctx.shadowColor = player.color;
    ctx.fillStyle = `${player.color}25`;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
    ctx.rotate(player.angle || 0);
    ctx.fillStyle = '#0b172a';
    ctx.strokeStyle = player.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(20, 0); ctx.lineTo(-12, -12); ctx.lineTo(-7, 0); ctx.lineTo(-12, 12); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#eef3ff';
    ctx.shadowBlur = 6; ctx.shadowColor = '#000';
    ctx.fillText(player.name, player.x, player.y - 31);
    ctx.restore();
  }

  function animationLoop(now) {
    const dt = lastRenderTime ? Math.min(.035, (now - lastRenderTime) / 1000) : 0;
    lastRenderTime = now;
    animationTime += dt;
    drawBackground();

    if (latestState) {
      for (const bullet of (latestState.bullets || [])) {
        ctx.save();
        ctx.fillStyle = bullet.color || '#ffffff';
        ctx.shadowBlur = 16;
        ctx.shadowColor = bullet.color || '#ffffff';
        ctx.beginPath(); ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      for (const player of (latestState.players || [])) drawPlayer(player);
    } else if (isPlaying) {
      ctx.fillStyle = 'rgba(238,243,255,.75)';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Conectando con la arena…', WIDTH / 2, HEIGHT / 2);
    } else {
      ctx.fillStyle = 'rgba(151,169,205,.7)';
      ctx.font = 'bold 18px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Busca un rival para empezar', WIDTH / 2, HEIGHT / 2);
    }

    requestAnimationFrame(animationLoop);
  }

  function updateJoystick(event) {
    const joystick = $('onlineJoystick');
    const knob = $('onlineJoyKnob');
    const rect = joystick.getBoundingClientRect();
    let dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width * .34);
    let dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height * .34);
    const length = Math.hypot(dx, dy);
    if (length > 1) { dx /= length; dy /= length; }
    knob.style.left = `${50 + dx * 34}%`;
    knob.style.top = `${50 + dy * 34}%`;
    input.left = dx < -.25;
    input.right = dx > .25;
    input.up = dy < -.25;
    input.down = dy > .25;
    sendInput();
  }

  function releaseJoystick() {
    joystickActive = false;
    joystickPointerId = null;
    input.left = false; input.right = false; input.up = false; input.down = false;
    $('onlineJoyKnob').style.left = '50%';
    $('onlineJoyKnob').style.top = '50%';
    sendInput();
  }

  $('onlineBtn').addEventListener('click', openOnline);
  $('onlineExitBtn').addEventListener('click', closeOnline);
  $('findMatchBtn').addEventListener('click', searchForMatch);
  $('cancelQueueBtn').addEventListener('click', cancelSearch);
  $('onlineRematchBtn').addEventListener('click', searchForMatch);
  $('onlineMenuBtn').addEventListener('click', closeOnline);
  $('onlineChangeNameBtn').addEventListener('click', () => {
    closeOnline();
    if (typeof window.CAOS_SHOW_NAME_SCREEN === 'function') window.CAOS_SHOW_NAME_SCREEN();
  });
  window.CAOS_CLOSE_ONLINE = closeOnline;

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (!onlineScreen.classList.contains('hidden') && ['arrowup','arrowdown','arrowleft','arrowright',' '].includes(key)) event.preventDefault();
    keys.add(key);
    if (!isPlaying) return;
    if (directions[key]) setInputDirection(directions[key], true);
    if (key === ' ') { input.fire = true; sendInput(); }
  });

  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    keys.delete(key);
    if (directions[key]) setInputDirection(directions[key], false);
    if (key === ' ') { input.fire = false; sendInput(); }
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button === 0 && isPlaying) {
      input.fire = true;
      sendInput();
      canvas.setPointerCapture?.(event.pointerId);
    }
  });
  window.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'mouse') { input.fire = false; sendInput(); }
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  window.addEventListener('blur', resetInput);

  const joystick = $('onlineJoystick');
  joystick.addEventListener('pointerdown', (event) => {
    joystickActive = true;
    joystickPointerId = event.pointerId;
    joystick.setPointerCapture(event.pointerId);
    updateJoystick(event);
  });
  joystick.addEventListener('pointermove', (event) => {
    if (joystickActive && event.pointerId === joystickPointerId) updateJoystick(event);
  });
  joystick.addEventListener('pointerup', releaseJoystick);
  joystick.addEventListener('pointercancel', releaseJoystick);

  const fireTouch = $('onlineFireTouch');
  fireTouch.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (isPlaying) { input.fire = true; sendInput(); fireTouch.setPointerCapture?.(event.pointerId); }
  });
  fireTouch.addEventListener('pointerup', () => { input.fire = false; sendInput(); });
  fireTouch.addEventListener('pointercancel', () => { input.fire = false; sendInput(); });

  window.setInterval(() => {
    if (!isPlaying) return;
    input.up = input.up || keys.has('w') || keys.has('arrowup');
    input.down = input.down || keys.has('s') || keys.has('arrowdown');
    input.left = input.left || keys.has('a') || keys.has('arrowleft');
    input.right = input.right || keys.has('d') || keys.has('arrowright');
    input.fire = input.fire || keys.has(' ');
    sendInput();
  }, 50);

  requestAnimationFrame(animationLoop);
})();