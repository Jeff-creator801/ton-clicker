// =====================
// КОНФИГУРАЦИЯ FIREBASE
// =====================
// ЗАМЕНИТЕ ЭТИ ЗНАЧЕНИЯ НА ВАШИ ИЗ FIREBASE CONSOLE
const firebaseConfig = {
  apiKey: "AIzaSyA2mxa0BR-V7FtqCFxkXtSoOTGUFXbI4M4",
  authDomain: "gammaton-fdbfd.firebaseapp.com",
  databaseURL: "https://gammaton-fdbfd-default-rtdb.firebaseio.com",
  projectId: "gammaton-fdbfd",
  storageBucket: "gammaton-fdbfd.firebasestorage.app",
  messagingSenderId: "118045498245",
  appId: "1:118045498245:web:f09ac245c00b2040c1c2ec"
};

// Инициализация Firebase
const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore(app);

// =====================
// ОСНОВНЫЕ НАСТРОЙКИ
// =====================
const YOUR_WALLET = "UQAmTM_EE8D6seecLKf-h8aXVQasliniDDQ52EvBj7PqExNr"; // Ваш кошелек для приема платежей
const CRYSTAL_TO_TON_RATE = 100000; // 1 TON = 100 000 кристаллов
const SHIP_PRICE = 0.5; // Цена NFT корабля в TON

// Инициализация TON Connect
const connector = new TonConnectSDK.TonConnect({
  manifestUrl: 'https://Jeff-creator801.github.io/ton-clicker/tonconnect-manifest.json'
});

// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// =====================
// СОСТОЯНИЕ ИГРЫ
// =====================
let gameState = {
  crystals: 0,
  upgrades: {
    pickaxe: { level: 1, cost: 10, bonus: 0.5 },
    robot: { level: 0, cost: 50, bonus: 2 },
    factory: { level: 0, cost: 200, bonus: 10 }
  },
  ships: [],
  walletAddress: '',
  username: tg.initDataUnsafe.user?.username || 'Гость'
};

// =====================
// ЭЛЕМЕНТЫ ИНТЕРФЕЙСА
// =====================
const clickBtn = document.getElementById('click-btn');
const connectBtn = document.getElementById('connect-wallet');
const withdrawBtn = document.getElementById('withdraw-btn');
const buyShipBtn = document.getElementById('buy-ship-btn');
const crystalsDisplay = document.getElementById('crystals');
const walletInfo = document.getElementById('wallet-info');
const upgradesContainer = document.getElementById('upgrades-container');
const shipsContainer = document.getElementById('ships-container');
const notification = document.getElementById('notification');

// =====================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =====================

// Показать уведомление
function showNotification(message, isSuccess = true) {
  notification.textContent = message;
  notification.style.display = 'block';
  notification.style.background = isSuccess ? '#10b981' : '#ef4444';
  
  setTimeout(() => {
    notification.style.display = 'none';
  }, 3000);
}

// Загрузка состояния игры из Firebase
async function loadGameState() {
  try {
    const userId = tg.initDataUnsafe.user.id;
    const doc = await db.collection('users').doc(userId).get();
    
    if (doc.exists) {
      gameState = doc.data();
      updateUI();
      showNotification('Игра загружена!');
    }
  } catch (e) {
    console.error('Ошибка загрузки:', e);
    showNotification('Ошибка загрузки данных', false);
  }
}

// Сохранение состояния игры в Firebase
async function saveGameState() {
  try {
    const userId = tg.initDataUnsafe.user.id;
    await db.collection('users').doc(userId).set(gameState);
  } catch (e) {
    console.error('Ошибка сохранения:', e);
  }
}

// Обновление интерфейса
function updateUI() {
  crystalsDisplay.textContent = gameState.crystals.toLocaleString();
  
  // Кошелек
  if (gameState.walletAddress) {
    const shortAddress = `${gameState.walletAddress.slice(0, 6)}...${gameState.walletAddress.slice(-4)}`;
    walletInfo.textContent = `TON кошелек: ${shortAddress}`;
  }
  
  // Улучшения
  upgradesContainer.innerHTML = '';
  for (const [id, upgrade] of Object.entries(gameState.upgrades)) {
    const div = document.createElement('div');
    div.className = 'upgrade';
    div.innerHTML = `
      <div class="upgrade-info">
        <div class="upgrade-name">${getUpgradeName(id)}</div>
        <div class="upgrade-stats">Уровень: ${upgrade.level} | Бонус: +${upgrade.bonus}/клик</div>
      </div>
      <button class="btn upgrade-btn" data-id="${id}">${upgrade.cost} крист.</button>
    `;
    upgradesContainer.appendChild(div);
  }
  
  // Назначение обработчиков улучшений
  document.querySelectorAll('.upgrade-btn').forEach(btn => {
    btn.addEventListener('click', () => upgrade(btn.dataset.id));
  });
  
  // Корабли
  shipsContainer.innerHTML = '';
  if (gameState.ships.length === 0) {
    shipsContainer.innerHTML = '<div style="text-align:center; padding:10px;">У вас пока нет кораблей</div>';
  } else {
    gameState.ships.forEach((ship, index) => {
      const shipCard = document.createElement('div');
      shipCard.className = 'ship-card';
      shipCard.innerHTML = `
        <div class="ship-name">${ship.name}</div>
        <div class="ship-stats">
          <div class="stat bonus">Бонус: ${ship.bonus.toFixed(1)}x</div>
          <div class="stat power">Сила: ${ship.power}⚡</div>
        </div>
        <button class="btn btn-secondary attack-btn" data-index="${index}" style="margin-top:10px;">Атаковать (10 крист.)</button>
      `;
      shipsContainer.appendChild(shipCard);
    });
    
    // Назначение обработчиков атак
    document.querySelectorAll('.attack-btn').forEach(btn => {
      btn.addEventListener('click', () => attack(btn.dataset.index));
    });
  }
}

// Названия улучшений
function getUpgradeName(id) {
  const names = {
    pickaxe: '⚒️ Базовая кирка',
    robot: '🤖 Добывающий робот',
    factory: '🏭 Кристальная фабрика'
  };
  return names[id] || id;
}

// Расчет добычи за клик
function calculateCrystalsPerClick() {
  let crystals = 1;
  
  // Бонус от улучшений
  for (const upgrade of Object.values(gameState.upgrades)) {
    crystals += upgrade.level * upgrade.bonus;
  }
  
  // Бонус от кораблей
  let shipBonus = 1;
  gameState.ships.forEach(ship => {
    shipBonus += ship.bonus;
  });
  
  return crystals * shipBonus;
}

// =====================
// ОСНОВНЫЕ ФУНКЦИИ ИГРЫ
// =====================

// Обработка клика
clickBtn.addEventListener('click', () => {
  const crystalsGained = calculateCrystalsPerClick();
  gameState.crystals += crystalsGained;
  
  // Вибрация (если поддерживается)
  if (navigator.vibrate) navigator.vibrate(50);
  
  saveGameState();
  updateUI();
  showNotification(`+${crystalsGained.toFixed(1)} кристаллов!`);
});

// Подключение TON кошелька
connectBtn.addEventListener('click', async () => {
  try {
    const wallets = await connector.getWallets();
    const wallet = wallets.find(w => w.name.includes('Tonkeeper')) || wallets[0];
    
    if (!wallet) {
      showNotification('TON кошельки не найдены', false);
      return;
    }
    
    connector.connect({
      universalLink: wallet.universalLink,
      bridgeUrl: wallet.bridgeUrl
    });
    
    connector.onStatusChange(walletInfo => {
      if (walletInfo) {
        gameState.walletAddress = walletInfo.account.address;
        saveGameState();
        updateUI();
        showNotification('Кошелек подключен!');
      }
    });
  } catch (e) {
    console.error('Ошибка подключения:', e);
    showNotification('Ошибка: ' + e.message, false);
  }
});

// Покупка улучшения
function upgrade(id) {
  const upgrade = gameState.upgrades[id];
  
  if (gameState.crystals >= upgrade.cost) {
    gameState.crystals -= upgrade.cost;
    upgrade.level++;
    upgrade.cost = Math.floor(upgrade.cost * 1.5);
    
    saveGameState();
    updateUI();
    showNotification(`Улучшение куплено! Уровень: ${upgrade.level}`);
  } else {
    showNotification('Недостаточно кристаллов!', false);
  }
}

// Покупка NFT корабля
buyShipBtn.addEventListener('click', async () => {
  if (!gameState.walletAddress) {
    showNotification('Сначала подключите кошелек!', false);
    return;
  }
  
  try {
    const transaction = {
      messages: [
        {
          address: YOUR_WALLET,
          amount: String(SHIP_PRICE * 1000000000) // Конвертация в нанотоны
        }
      ],
      validUntil: Math.floor(Date.now() / 1000) + 300 // 5 минут
    };
    
    const result = await connector.sendTransaction(transaction);
    
    if (result) {
      const shipTypes = [
        "Дракон Тьмы", "Страж Света", "Космический Рейдер", 
        "Галактический Истребитель", "Звездный Разрушитель"
      ];
      const randomType = shipTypes[Math.floor(Math.random() * shipTypes.length)];
      
      const newShip = {
        name: `${randomType} #${gameState.ships.length + 1}`,
        power: Math.floor(Math.random() * 50) + 50,
        bonus: parseFloat((Math.random() * 0.8 + 0.3).toFixed(1)) // 0.3-1.1x
      };
      
      gameState.ships.push(newShip);
      saveGameState();
      updateUI();
      showNotification(`Корабль "${newShip.name}" куплен! Бонус: ${newShip.bonus}x`);
    }
  } catch (e) {
    console.error('Ошибка покупки:', e);
    showNotification('Ошибка: ' + (e.message || "Транзакция отменена"), false);
  }
});

// PvP атака
async function attack(shipIndex) {
  if (gameState.crystals < 10) {
    showNotification('Нужно 10 кристаллов для атаки!', false);
    return;
  }
  
  gameState.crystals -= 10;
  saveGameState();
  updateUI();
  
  try {
    // Поиск случайного противника
    const usersSnapshot = await db.collection('users').get();
    const opponents = [];
    
    usersSnapshot.forEach(doc => {
      if (doc.id !== tg.initDataUnsafe.user.id && 
          doc.data().ships?.length > 0 &&
          doc.data().walletAddress) {
        opponents.push({ id: doc.id, ...doc.data() });
      }
    });
    
    if (opponents.length === 0) {
      gameState.crystals += 10;
      saveGameState();
      updateUI();
      showNotification('Нет подходящих противников!', false);
      return;
    }
    
    const opponent = opponents[Math.floor(Math.random() * opponents.length)];
    const playerShip = gameState.ships[shipIndex];
    const opponentShip = opponent.ships[Math.floor(Math.random() * opponent.ships.length)];
    
    // Расчет боя
    const playerPower = playerShip.power * (0.8 + Math.random() * 0.4);
    const opponentPower = opponentShip.power * (0.8 + Math.random() * 0.4);
    
    if (playerPower > opponentPower) {
      const winnings = Math.floor(opponentPower / 5);
      gameState.crystals += winnings;
      saveGameState();
      updateUI();
      showNotification(`Победа! Вы получили ${winnings} кристаллов`);
    } else {
      showNotification(`Поражение против ${opponentShip.name}`, false);
    }
  } catch (e) {
    console.error('Ошибка атаки:', e);
    showNotification('Ошибка PvP боя', false);
    gameState.crystals += 10;
    saveGameState();
    updateUI();
  }
}

// Вывод кристаллов в TON
withdrawBtn.addEventListener('click', async () => {
  if (!gameState.walletAddress) {
    showNotification('Сначала подключите кошелек!', false);
    return;
  }
  
  const minWithdraw = 1000;
  if (gameState.crystals < minWithdraw) {
    showNotification(`Минимум ${minWithdraw} кристаллов для вывода`, false);
    return;
  }
  
  const tonAmount = gameState.crystals / CRYSTAL_TO_TON_RATE;
  const transactionAmount = tonAmount * 0.9; // 10% комиссия
  
  try {
    const transaction = {
      messages: [
        {
          address: gameState.walletAddress,
          amount: String(transactionAmount * 1000000000) // Конвертация в нанотоны
        }
      ],
      validUntil: Math.floor(Date.now() / 1000) + 300 // 5 минут
    };
    
    await connector.sendTransaction(transaction);
    
    // Сбос кристаллов после успешного вывода
    gameState.crystals = 0;
    saveGameState();
    updateUI();
    showNotification(`Успешно выведено ${transactionAmount.toFixed(4)} TON!`);
  } catch (e) {
    console.error('Ошибка вывода:', e);
    showNotification('Ошибка: ' + (e.message || "Транзакция отменена"), false);
  }
});

// =====================
// ИНИЦИАЛИЗАЦИЯ ИГРЫ
// =====================
tg.ready();
loadGameState();

// Авто-добыча каждые 10 секунд (если приложение открыто)
setInterval(() => {
  if (document.visibilityState === 'visible') {
    const crystalsGained = calculateCrystalsPerClick() * 2; // Бонус за авто-добычу
    gameState.crystals += crystalsGained;
    saveGameState();
    updateUI();
  }
}, 10000); // 10 секунд
