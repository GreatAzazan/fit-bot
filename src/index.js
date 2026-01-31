const config = require('./config');
const { createBot } = require('./bot');
const { initializeSheets } = require('./sheets');

async function main() {
  console.log('Starting Fitness Tracker Bot...');

  // Validate configuration
  if (!config.telegram.token) {
    console.error('Error: TELEGRAM_BOT_TOKEN is not set');
    process.exit(1);
  }

  if (!config.google.spreadsheetId) {
    console.error('Error: GOOGLE_SPREADSHEET_ID is not set');
    process.exit(1);
  }

  // Initialize Google Sheets
  try {
    await initializeSheets();
    console.log('Google Sheets initialized');
  } catch (error) {
    console.error('Failed to initialize Google Sheets:', error.message);
    process.exit(1);
  }

  // Start Telegram bot
  const bot = createBot();

  bot.launch();
  console.log('Telegram bot started');

  // Graceful shutdown
  process.once('SIGINT', () => {
    console.log('Shutting down...');
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    console.log('Shutting down...');
    bot.stop('SIGTERM');
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
