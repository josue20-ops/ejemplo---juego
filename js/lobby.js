// Pantalla inicial y nombre visible del jugador.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const NAME_KEY = 'caos_player_name_v1';
  const nameOverlay = $('nameOverlay');
  const nameForm = $('nameForm');
  const nameInput = $('playerNameInput');
  const nameError = $('nameError');
  const startOverlay = $('startOverlay');

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
    $('statusNote').textContent = `Jugador: ${name}. Elige cómo jugar.`;
    nameOverlay.classList.add('hidden');
    nameOverlay.setAttribute('aria-hidden', 'true');
    startOverlay.classList.remove('hidden');
    hideNameError();
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

  // El usuario confirma el nombre en cada nueva sesión, aunque exista uno guardado.
  nameInput.focus();
})();
