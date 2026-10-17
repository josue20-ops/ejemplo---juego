// Pantalla inicial, nombre visible del jugador y sistema de Lobby.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const NAME_KEY = 'caos_player_name_v1';
  const nameOverlay = $('nameOverlay');
  const nameForm = $('nameForm');
  const nameInput = $('playerNameInput');
  const nameError = $('nameError');
  const startOverlay = $('startOverlay');
  
  // CORRECCIÓN: Intentar usar un socket global para evitar múltiples conexiones.
  const socket = window.socket || io();
  window.socket = socket; // Lo exponemos para que otros scripts lo usen

  // --- CREACIÓN DINÁMICA DE LA INTERFAZ DEL LOBBY ---
  const lobbyContainer = document.createElement('div');
  lobbyContainer.id = 'caos-lobby-container';
  lobbyContainer.style.marginTop = '20px';
  lobbyContainer.style.padding = '15px';
  lobbyContainer.style.border = '1px solid rgba(255,255,255,0.2)';
  lobbyContainer.style.borderRadius = '8px';
  lobbyContainer.style.background = 'rgba(0,0,0,0.3)';
  lobbyContainer.style.display = 'none';

  const lobbyTitle = document.createElement('h3');
  lobbyTitle.textContent = 'Jugadores en línea';
  lobbyTitle.style.marginTop = '0';
  lobbyTitle.style.fontSize = '1.1rem';
  lobbyTitle.style.color = '#54f2e8';

  const lobbyList = document.createElement('ul');
  lobbyList.id = 'lobby-player-list';
  lobbyList.style.listStyle = 'none';
  lobbyList.style.padding = '0';
  lobbyList.style.margin = '0';
  lobbyList.style.maxHeight = '200px';
  lobbyList.style.overflowY = 'auto';

  const lobbyEmptyMsg = document.createElement('p');
  lobbyEmptyMsg.textContent = 'Buscando otros jugadores...';
  lobbyEmptyMsg.style.fontSize = '0.9rem';
  lobbyEmptyMsg.style.color = '#aaa';
  lobbyEmptyMsg.style.fontStyle = 'italic';

  lobbyContainer.appendChild(lobbyTitle);
  lobbyContainer.appendChild(lobbyEmptyMsg);
  lobbyContainer.appendChild(lobbyList);

  if (startOverlay) {
    startOverlay.appendChild(lobbyContainer);
  }

  let currentName = null; // Guardamos el nombre para reconexiones

  function normalizeName(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function isValidName(name) {
    return name.length >= 2 && name.length <= 16 && /^[\p{L}\p{N} _-]+$/u.test(name);
  }

  function showError(message) {
    nameError.textContent = message;
    nameError.classList.remove('hidden');
  }

  function hideNameError() {
    nameError.textContent = '';
    nameError.classList.add('hidden');
  }

  function showNameScreen() {
    if (typeof window.CAOS_CLOSE_ONLINE === 'function') {
      window.CAOS_CLOSE_ONLINE();
    }
    startOverlay.classList.add('hidden');
    lobbyContainer.style.display = 'none';
    nameOverlay.classList.remove('hidden');
    nameOverlay.setAttribute('aria-hidden', 'false');
    hideNameError();
    nameInput.focus();
  }

  function acceptName(name) {
    currentName = name;
    window.CAOS_PLAYER_NAME = name;
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch (_) {}

    $('displayNameMenu').textContent = name;
    $('onlineCurrentName').textContent = name;
    $('statusNote').textContent = `Jugador: ${name}. Elige a quién retar.`;
    
    nameOverlay.classList.add('hidden');
    nameOverlay.setAttribute('aria-hidden', 'true');
    startOverlay.classList.remove('hidden');
    hideNameError();

    // Si el socket está conectado, enviamos el registro
    if (socket.connected) {
      socket.emit('register-player', { name });
    }
    
    lobbyContainer.style.display = 'block';
  }

  nameForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = normalizeName(nameInput.value);

    if (!isValidName(name)) {
      showError('Escribe entre 2 y 16 caracteres. Usa letras, números, espacios, guion o guion bajo.');
      return;
    }

    acceptName(name);
  });

  $('changeNameBtn').addEventListener('click', showNameScreen);
  window.CAOS_SHOW_NAME_SCREEN = showNameScreen;

  try {
    const savedName = localStorage.getItem(NAME_KEY);
    if (savedName) nameInput.value = savedName;
  } catch (_) {}

  // --- LÓGICA DE SOCKET ---

  // Si el socket se reconecta (ej. recarga de página o microcorte), volvemos a registrar el nombre
  socket.on('connect', () => {
    if (currentName) {
      socket.emit('register-player', { name: currentName });
    }
  });

  socket.on('registration-result', (result) => {
    if (!result.ok) {
      alert(result.message);
      showNameScreen(); // Devolvemos al usuario a la pantalla de nombre
    }
  });

  socket.on('lobby-list', (players) => {
    lobbyList.innerHTML = '';
    const otherPlayers = players.filter(p => p.id !== socket.id);

    if (otherPlayers.length === 0) {
      lobbyEmptyMsg.style.display = 'block';
      lobbyEmptyMsg.textContent = 'No hay otros jugadores en línea. Esperando...';
    } else {
      lobbyEmptyMsg.style.display = 'none';
      otherPlayers.forEach(player => {
        const li = document.createElement('li');
        li.style.marginBottom = '8px';
        
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'small-btn';
        btn.style.width = '100%';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'space-between';
        btn.style.alignItems = 'center';
        btn.innerHTML = `<span>${player.name}</span> <span style="color:#54f2e8">⚔️ Retar</span>`;
        
        btn.addEventListener('click', () => {
          btn.innerHTML = `<span>${player.name}</span> <span style="color:#aaa">Retando...</span>`;
          btn.disabled = true;
          socket.emit('challenge-player', player.id);
          setTimeout(() => { 
            btn.innerHTML = `<span>${player.name}</span> <span style="color:#54f2e8">⚔️ Retar</span>`; 
            btn.disabled = false; 
          }, 3000);
        });

        li.appendChild(btn);
        lobbyList.appendChild(li);
      });
    }
  });

  socket.on('challenge-error', (data) => {
    alert(data.message);
  });

  nameInput.focus();
})();