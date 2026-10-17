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
  
  // Asumimos que 'socket' está definido globalmente en online.js
  // Si no es así, esto lanzará un error. Asegúrate de que socket.io esté cargado.
  const socket = window.socket || io();

  // --- CREACIÓN DINÁMICA DE LA INTERFAZ DEL LOBBY ---
  // Para que no tengas que tocar tu index.html, creamos los elementos aquí.
  const lobbyContainer = document.createElement('div');
  lobbyContainer.id = 'caos-lobby-container';
  lobbyContainer.style.marginTop = '20px';
  lobbyContainer.style.padding = '15px';
  lobbyContainer.style.border = '1px solid rgba(255,255,255,0.2)';
  lobbyContainer.style.borderRadius = '8px';
  lobbyContainer.style.background = 'rgba(0,0,0,0.3)';
  lobbyContainer.style.display = 'none'; // Oculto hasta que esté en el menú

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

  // Insertamos el lobby dentro de la pantalla de inicio
  if (startOverlay) {
    // Lo insertamos antes del último botón o al final de la pantalla de inicio
    startOverlay.appendChild(lobbyContainer);
  }

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
    window.CAOS_PLAYER_NAME = name;
    try {
      localStorage.setItem(NAME_KEY, name);
    } catch (_) {
      // El juego sigue funcionando aunque el navegador bloquee localStorage.
    }
    
    $('displayNameMenu').textContent = name;
    $('onlineCurrentName').textContent = name;
    $('statusNote').textContent = `Jugador: ${name}. Elige a quién retar.`;
    
    nameOverlay.classList.add('hidden');
    nameOverlay.setAttribute('aria-hidden', 'true');
    startOverlay.classList.remove('hidden');
    hideNameError();

    // Avisamos al servidor de nuestro nombre para entrar al lobby
    socket.emit('register-player', { name });
    
    // Mostramos el contenedor del lobby
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
  } catch (_) {
    // No se requiere almacenamiento local.
  }

  // --- LÓGICA DE SOCKET PARA EL LOBBY ---
  
  // Escuchamos la lista de jugadores enviada por el servidor
  socket.on('lobby-list', (players) => {
    // Limpiamos la lista actual
    lobbyList.innerHTML = '';
    
    // Filtramos para no mostrarnos a nosotros mismos
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
        btn.className = 'small-btn'; // Usa tus estilos existentes
        btn.style.width = '100%';
        btn.style.display = 'flex';
        btn.style.justifyContent = 'space-between';
        btn.style.alignItems = 'center';
        btn.innerHTML = `<span>${player.name}</span> <span style="color:#54f2e8">⚔️ Retar</span>`;
        
        // Al hacer clic, enviamos el reto
        btn.addEventListener('click', () => {
          btn.textContent = 'Retando...';
          btn.disabled = true;
          socket.emit('challenge-player', player.id);
          
          // Si falla (porque el otro se fue), el servidor nos avisará
          setTimeout(() => { btn.textContent = player.name + ' ⚔️ Retar'; btn.disabled = false; }, 3000);
        });

        li.appendChild(btn);
        lobbyList.appendChild(li);
      });
    }
  });

  // Si intentamos retar a alguien que ya no está
  socket.on('challenge-error', (data) => {
    alert(data.message);
  });

  // El usuario confirma el nombre en cada nueva sesión, aunque exista uno guardado.
  nameInput.focus();
})();