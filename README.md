# Fitness Tracker Telegram Bot

Telegram бот для отслеживания тренировок и состава тела с сохранением данных в Google Sheets.

## Возможности

- Запись тренировок с выбором упражнений через кнопки
- Запись состава тела (вес, мышцы, жир, вода)
- Просмотр статистики с графиками
- Выбор периода: последние 10 записей или всё время
- Работа в групповом чате/треде (опционально)

## Список упражнений

- Вертикальная тяга
- Приседания со штангой
- Горизонтальная тяга
- Сгибание ног лежа
- Жим лежа
- Бицепс
- Гравитрон
- Бабочка
- Трицепс
- Пресс
- Гантели на плечи

## Установка

### 1. Клонировать репозиторий

```bash
git clone https://github.com/greatazazan/fit-bot.git
cd fit-bot
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Настроить Google Sheets API

1. Создать проект в [Google Cloud Console](https://console.cloud.google.com/)
2. Включить Google Sheets API
3. Создать Service Account и скачать JSON ключ
4. Сохранить ключ как `credentials.json` в корне проекта
5. Создать Google Spreadsheet и дать доступ Service Account (email из credentials.json)

### 4. Создать Telegram бота

1. Написать [@BotFather](https://t.me/BotFather)
2. Создать бота командой `/newbot`
3. Скопировать токен

### 5. Настроить переменные окружения

```bash
cp .env.example .env
```

Заполнить `.env`:

```env
FIT_BOT_TOKEN=your_telegram_bot_token
FIT_SPREADSHEET_ID=your_google_spreadsheet_id
FIT_CHAT_ID=              # опционально, для работы только в определённом чате
FIT_THREAD_ID=            # опционально, для работы в треде (форум)
```

### 6. Запустить

```bash
# Напрямую
npm start

# Или через Docker
docker compose up -d
```

## Использование

### Команды

- `/start` — главное меню
- `/workout` — записать тренировку
- `/body` — записать вес
- `/help` — справка

### Запись тренировки

1. Нажать "Записать тренировку"
2. Выбрать упражнение
3. Ввести данные: `80 10` (вес в кг, повторения)
4. Выбрать следующее упражнение или завершить

### Запись веса

1. Нажать "Записать вес"
2. Ввести данные: `75.5` или `75.5 35 15 55` (вес, мышцы, жир, вода)

### Статистика

- Выбрать упражнение или "Динамика веса тела"
- Выбрать период: последние 10 или всё время
- Бот отправит график и таблицу

## Структура Google Sheets

Бот автоматически создаст два листа:

**Тренировки:**
| Дата | Упражнение 1 (кг) | Упражнение 1 (повт) | ... |

**Состав тела:**
| Дата | Вес (кг) | Мышцы (кг) | Жир (кг) | Вода (%) |

## Docker

```yaml
services:
  fit-bot:
    image: node:20-alpine
    container_name: fit-bot
    working_dir: /app
    command: node src/index.js
    volumes:
      - .:/app:ro
      - ./node_modules:/app/node_modules:ro
      - ./credentials.json:/app/credentials.json:ro
    env_file:
      - .env
    restart: unless-stopped
```

## Технологии

- Node.js 20+
- Telegraf — Telegram Bot API
- googleapis — Google Sheets API
- QuickChart.io — генерация графиков

## Лицензия

MIT
