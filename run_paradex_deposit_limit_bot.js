// Необходимые зависимости
const { Telegraf, Markup } = require('telegraf')
const axios = require('axios')
const fs = require('fs')
const path = require('path')
require('dotenv').config() // Загружает переменные из .env

// Путь к файлу для хранения данных пользователей
const DATA_FILE = path.join(__dirname, 'user_data.json')

// Инициализация бота с токеном (замените 'YOUR_BOT_TOKEN' на ваш токен)
const bot = new Telegraf(process.env.BOT_TOKEN)

// Инициализация хранилища данных пользователей
let userDataStore = {}
loadUserData()

// Тексты для разных языков
const texts = {
  ru: {
    welcome:
      'Добро пожаловать gigavault_monitor_bot! Этот бот мониторит свободное место для депозита в Gigavault Vault на бирже Paradex. Выберите язык:',
    languageSelected: 'Вы выбрали русский язык.',
    mainMenu: 'Главное меню. Выберите действие:',
    createAlert: 'Создать уведомление',
    viewAlert: 'Посмотреть уведомление',
    deleteAlert: 'Удалить уведомление',
    enterAmount: 'Введите сумму в $ для уведомления:',
    alertCreated:
      'Уведомление создано. Вы получите сообщение, когда сумма доступного депозита превысит указанную вами.',
    noAlert: 'У вас нет активных уведомлений.',
    currentAlert: 'Ваше текущее уведомление установлено на сумму: $',
    alertDeleted: 'Уведомление удалено.',
    depositAlertTriggered: 'Доступен депозит в размере до $',
    invalidAmount: 'Пожалуйста, введите корректное число.',
    backToMenu: 'Вернуться в меню',
  },
  en: {
    welcome:
      'Welcome to gigavault_monitor_bot! This bot monitors available deposit space in the Gigavault Vault on the Paradex. Please select a language:',
    languageSelected: 'You have selected English.',
    mainMenu: 'Main menu. Choose an action:',
    createAlert: 'Create alert',
    viewAlert: 'View alert',
    deleteAlert: 'Delete alert',
    enterAmount: 'Enter amount in $ for the alert:',
    alertCreated:
      'Alert created. You will receive a notification when the available deposit amount exceeds your specified value.',
    noAlert: 'You have no active alerts.',
    currentAlert: 'Your current alert is set to: $',
    alertDeleted: 'Alert deleted.',
    depositAlertTriggered: 'Deposit available up to $',
    invalidAmount: 'Please enter a valid number.',
    backToMenu: 'Back to menu',
  },
}

// Сохранение данных пользователей
function saveUserData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(userDataStore, null, 2))
}

// Загрузка данных пользователей
function loadUserData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      userDataStore = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    }
  } catch (error) {
    console.error('Error loading user data:', error)
    userDataStore = {}
  }
}

// Обработчик команды /start
bot.start((ctx) => {
  ctx.reply(
    texts.ru.welcome,
    Markup.inlineKeyboard([
      Markup.button.callback('Русский', 'lang_ru'),
      Markup.button.callback('English', 'lang_en'),
    ])
  )
})

// Обработчики выбора языка
bot.action('lang_ru', (ctx) => {
  setUserLanguage(ctx.from.id, 'ru')
  ctx.reply(texts.ru.languageSelected)
  showMainMenu(ctx)
})

bot.action('lang_en', (ctx) => {
  setUserLanguage(ctx.from.id, 'en')
  ctx.reply(texts.en.languageSelected)
  showMainMenu(ctx)
})

// Установка языка пользователя
function setUserLanguage(userId, language) {
  if (!userDataStore[userId]) {
    userDataStore[userId] = {}
  }
  userDataStore[userId].language = language
  saveUserData()
}

// Получение языка пользователя
function getUserLanguage(userId) {
  return userDataStore[userId]?.language || 'ru' // По умолчанию русский
}

// Функция для отображения главного меню
function showMainMenu(ctx) {
  const userId = ctx.from.id
  const lang = getUserLanguage(userId)

  ctx.reply(
    texts[lang].mainMenu,
    Markup.inlineKeyboard([
      [Markup.button.callback(texts[lang].createAlert, 'create_alert')],
      [Markup.button.callback(texts[lang].viewAlert, 'view_alert')],
      [Markup.button.callback(texts[lang].deleteAlert, 'delete_alert')],
    ])
  )
}

// Обработчик кнопки "Создать уведомление"
bot.action('create_alert', (ctx) => {
  const userId = ctx.from.id
  const lang = getUserLanguage(userId)

  if (!userDataStore[userId]) {
    userDataStore[userId] = { language: lang }
  }

  userDataStore[userId].awaitingAmount = true
  saveUserData()

  ctx.reply(texts[lang].enterAmount)
})

// Обработчик кнопки "Посмотреть уведомление"
bot.action('view_alert', (ctx) => {
  const userId = ctx.from.id
  const lang = getUserLanguage(userId)

  if (!userDataStore[userId] || !userDataStore[userId].alertAmount) {
    ctx.reply(
      texts[lang].noAlert,
      Markup.inlineKeyboard([Markup.button.callback(texts[lang].backToMenu, 'back_to_menu')])
    )
    return
  }

  ctx.reply(
    texts[lang].currentAlert + userDataStore[userId].alertAmount,
    Markup.inlineKeyboard([Markup.button.callback(texts[lang].backToMenu, 'back_to_menu')])
  )
})

// Обработчик кнопки "Удалить уведомление"
bot.action('delete_alert', (ctx) => {
  const userId = ctx.from.id
  const lang = getUserLanguage(userId)

  if (userDataStore[userId]) {
    delete userDataStore[userId].alertAmount
    saveUserData()
  }

  ctx.reply(
    texts[lang].alertDeleted,
    Markup.inlineKeyboard([Markup.button.callback(texts[lang].backToMenu, 'back_to_menu')])
  )
})

// Обработчик кнопки "Вернуться в меню"
bot.action('back_to_menu', (ctx) => {
  showMainMenu(ctx)
})

// Обработчик текстовых сообщений для создания уведомления
bot.on('text', (ctx) => {
  const userId = ctx.from.id
  const lang = getUserLanguage(userId)

  if (userDataStore[userId]?.awaitingAmount) {
    const amount = parseFloat(ctx.message.text)

    if (isNaN(amount) || amount <= 0) {
      ctx.reply(texts[lang].invalidAmount)
      return
    }

    userDataStore[userId].alertAmount = amount
    userDataStore[userId].awaitingAmount = false
    saveUserData()

    ctx.reply(
      texts[lang].alertCreated,
      Markup.inlineKeyboard([Markup.button.callback(texts[lang].backToMenu, 'back_to_menu')])
    )
  }
})

// Функция для выполнения HTTP-запросов с повторными попытками
async function fetchWithRetry(url, options, maxRetries = 50, retryDelay = 5000) {
  let lastError

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.post(url, JSON.parse(options.body), {
        headers: options.headers,
      })
      return response.data
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error.message)
      lastError = error

      if (attempt < maxRetries - 1) {
        console.log(`Retrying in ${retryDelay / 1000} seconds...`)
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }
  }

  throw lastError
}

// Функция для преобразования шестнадцатеричного числа в десятичное
function hexToDec(hexString) {
  return BigInt(hexString).toString()
}

// Основная функция для проверки данных и отправки уведомлений
async function checkDeposits() {
  const apiUrl = 'https://juno.api.prod.paradex.trade/rpc/v0_7'
  const headers = {
    accept: '*/*',
    'accept-language': 'ru,en-US;q=0.9,en;q=0.8,tg;q=0.7,zh-TW;q=0.6,zh;q=0.5',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    pragma: 'no-cache',
    priority: 'u=1, i',
    'sec-ch-ua': '"Not A(Brand";v="8", "Chromium";v="132", "Google Chrome";v="132"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    Referer: 'https://voyager.prod.paradex.trade/',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  }

  let tvlLimit, totalAssets

  try {
    // Первый запрос для получения tvl_limit
    const body1 = {
      id: 1,
      jsonrpc: '2.0',
      method: 'starknet_call',
      params: {
        request: {
          contract_address: '0x05f43c92dbe4e995115f351254407e7e84abf04cbe32a536345b9d6c36bc750f',
          entry_point_selector: '0x37b7c92318a88278a7f6c6f48e2e222d93275e2ca33599f69bbd967f7ec3c',
          calldata: [],
        },
        block_id: 'pending',
      },
    }

    const response1 = await fetchWithRetry(apiUrl, {
      headers: headers,
      body: JSON.stringify(body1),
      method: 'POST',
    })

    tvlLimit = hexToDec(response1.result[0])

    // Второй запрос для получения total_assets
    const body2 = {
      id: 1,
      jsonrpc: '2.0',
      method: 'starknet_call',
      params: {
        request: {
          contract_address: '0x05f43c92dbe4e995115f351254407e7e84abf04cbe32a536345b9d6c36bc750f',
          entry_point_selector: '0x21e1f7868a42adf8781cf7d3a76817ceaaafda5d56b7e7d8f26bc4f27ecdbe2',
          calldata: [],
        },
        block_id: 'pending',
      },
    }

    const response2 = await fetchWithRetry(apiUrl, {
      headers: headers,
      body: JSON.stringify(body2),
      method: 'POST',
    })

    totalAssets = hexToDec(response2.result[0])

    // Вычисление max_allowed_deposit
    const maxAllowedDeposit = (BigInt(tvlLimit) - BigInt(totalAssets)) / 1000000n
    console.log(`BigInt(tvlLimit):`)
    console.log(BigInt(tvlLimit))
    console.log(BigInt(totalAssets))
    console.log(maxAllowedDeposit)

    // Отправка уведомлений пользователям
    Object.entries(userDataStore).forEach(([userId, userData]) => {
      if (userData.alertAmount) {
        const userAmount = BigInt(Math.floor(userData.alertAmount))

        if (maxAllowedDeposit > userAmount) {
          const lang = userData.language || 'ru'
          const message = `${texts[lang].depositAlertTriggered}${maxAllowedDeposit.toString()}`

          bot.telegram
            .sendMessage(
              userId,
              message,
              Markup.inlineKeyboard([
                Markup.button.callback(texts[lang].backToMenu, 'back_to_menu'),
              ])
            )
            .catch((error) => {
              console.error(`Failed to send notification to user ${userId}:`, error)
            })

          // // Отметить, что уведомление было отправлено и удалить его
          // delete userData.alertAmount
          saveUserData()
        }
      }
    })
  } catch (error) {
    console.error('Error in checkDeposits:', error)
    // Повторная попытка через 5 секунд
    setTimeout(checkDeposits, 5000)
    return
  }

  // Запланировать следующую проверку через минуту
  setTimeout(checkDeposits, 5000)
}

// Запуск периодической проверки
checkDeposits()

// Обработка ошибок
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err)
})

// Запуск бота
bot
  .launch()
  .then(() => {
    console.log('Bot started successfully!')
  })
  .catch((err) => {
    console.error('Failed to start bot:', err)
  })

// Включение graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
