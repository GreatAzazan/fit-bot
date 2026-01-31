require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    threadId: process.env.TELEGRAM_THREAD_ID ? parseInt(process.env.TELEGRAM_THREAD_ID, 10) : null,
  },
  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID,
    credentialsPath: process.env.GOOGLE_CREDENTIALS_PATH || './credentials.json',
  },
  sheets: {
    workoutSheet: 'Тренировки',
    bodySheet: 'Состав тела',
  },
};
