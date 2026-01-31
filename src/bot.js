const { Telegraf, Markup } = require('telegraf');
const config = require('./config');
const { exercises, getExerciseById } = require('./exercises');
const sheets = require('./sheets');

// Generate chart URL using QuickChart.io
function generateChartUrl(labels, datasets, title, yAxisLabel = '') {
  const chart = {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((ds, i) => ({
        label: ds.label,
        data: ds.data,
        borderColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0'][i % 4],
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 4,
      })),
    },
    options: {
      title: { display: true, text: title, fontSize: 16 },
      scales: {
        yAxes: [{
          ticks: { beginAtZero: false },
          scaleLabel: { display: !!yAxisLabel, labelString: yAxisLabel }
        }],
      },
      legend: { display: datasets.length > 1 },
    },
  };

  const chartConfig = encodeURIComponent(JSON.stringify(chart));
  return `https://quickchart.io/chart?c=${chartConfig}&w=600&h=400&bkg=white`;
}

function createBot() {
  const bot = new Telegraf(config.telegram.token);

  // User state storage (in-memory)
  const userState = new Map();

  // Only respond in configured chat/thread, ignore private messages
  bot.use(async (ctx, next) => {
    const chatId = config.telegram.chatId;
    if (chatId) {
      // If chat is configured, only respond there
      const currentChatId = ctx.chat?.id?.toString();
      if (currentChatId !== chatId) {
        return; // Ignore messages from other chats
      }
    }
    return next();
  });

  // Get thread options for replies
  function getThreadOptions(ctx) {
    const options = {};
    if (ctx.message?.message_thread_id) {
      options.message_thread_id = ctx.message.message_thread_id;
    }
    return options;
  }

  // Main menu keyboard
  function getMainMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('📝 Записать тренировку', 'workout_start')],
      [Markup.button.callback('⚖️ Записать вес', 'body_start')],
      [Markup.button.callback('📊 Статистика', 'menu_stats')],
    ]);
  }

  // Stats submenu
  function getStatsMenu() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('💪 Прогресс упражнений', 'stats_exercises')],
      [Markup.button.callback('📈 Динамика веса тела', 'stats_body')],
      [Markup.button.callback('◀️ Назад', 'menu_main')],
    ]);
  }

  // Exercise selection buttons (2 columns)
  function getExerciseButtons(prefix = 'ex') {
    const buttons = [];
    for (let i = 0; i < exercises.length; i += 2) {
      const row = [Markup.button.callback(exercises[i].name, `${prefix}_${exercises[i].id}`)];
      if (exercises[i + 1]) {
        row.push(Markup.button.callback(exercises[i + 1].name, `${prefix}_${exercises[i + 1].id}`));
      }
      buttons.push(row);
    }
    buttons.push([
      Markup.button.callback('✅ Завершить тренировку', 'workout_finish'),
      Markup.button.callback('❌ Отмена', 'menu_main'),
    ]);
    return Markup.inlineKeyboard(buttons);
  }

  // Exercise selection for stats
  function getStatsExerciseButtons() {
    const buttons = [];
    for (let i = 0; i < exercises.length; i += 2) {
      const row = [Markup.button.callback(exercises[i].name, `exercise_${exercises[i].id}`)];
      if (exercises[i + 1]) {
        row.push(Markup.button.callback(exercises[i + 1].name, `exercise_${exercises[i + 1].id}`));
      }
      buttons.push(row);
    }
    buttons.push([Markup.button.callback('◀️ Назад', 'menu_stats')]);
    return Markup.inlineKeyboard(buttons);
  }

  // Start command
  bot.start(async (ctx) => {
    const threadOpts = getThreadOptions(ctx);
    await ctx.reply('🏋️ Фитнес-трекер\n\nВыберите действие:', { ...getMainMenu(), ...threadOpts });
  });

  // Help command
  bot.help(async (ctx) => {
    const threadOpts = getThreadOptions(ctx);
    await ctx.reply(
      '🏋️ Фитнес-трекер\n\n' +
        'Команды:\n' +
        '/start — главное меню\n' +
        '/workout — записать тренировку\n' +
        '/body — записать вес\n\n' +
        'При записи тренировки вводите данные в формате:\n' +
        '`80 10` — вес 80кг, 10 повторений\n' +
        '`80` — только вес\n\n' +
        'При записи веса:\n' +
        '`75.5` — только вес тела\n' +
        '`75.5 35 15 55` — вес, мышцы, жир, вода',
      { parse_mode: 'Markdown', ...threadOpts }
    );
  });

  // Shortcut commands
  bot.command('workout', async (ctx) => {
    const threadOpts = getThreadOptions(ctx);
    const userId = ctx.from.id;
    userState.set(userId, { mode: 'workout', exercises: {}, date: new Date() });
    await ctx.reply(
      '📝 Тренировка\n\nВыберите упражнение:',
      { ...getExerciseButtons(), ...threadOpts }
    );
  });

  bot.command('body', async (ctx) => {
    const threadOpts = getThreadOptions(ctx);
    const userId = ctx.from.id;
    userState.set(userId, { mode: 'body_input', date: new Date() });
    await ctx.reply(
      '⚖️ Запись веса\n\n' +
        'Введите данные в формате:\n' +
        '`75.5` — только вес\n' +
        '`75.5 35 15 55` — вес, мышцы, жир, вода\n\n' +
        'Или нажмите Отмена',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'menu_main')]]),
        ...threadOpts
      }
    );
  });

  // Main menu callback
  bot.action('menu_main', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    userState.delete(userId);
    await ctx.editMessageText('🏋️ Фитнес-трекер\n\nВыберите действие:', getMainMenu());
  });

  // Start workout
  bot.action('workout_start', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    userState.set(userId, { mode: 'workout', exercises: {}, date: new Date() });
    await ctx.editMessageText('📝 Тренировка\n\nВыберите упражнение:', getExerciseButtons());
  });

  // Exercise selected for workout
  bot.action(/^ex_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const exerciseId = ctx.match[1];
    const exercise = getExerciseById(exerciseId);
    const userId = ctx.from.id;

    if (!exercise) {
      await ctx.editMessageText('❌ Упражнение не найдено', getMainMenu());
      return;
    }

    const state = userState.get(userId) || { mode: 'workout', exercises: {}, date: new Date() };
    state.currentExercise = exerciseId;
    state.mode = 'exercise_input';
    userState.set(userId, state);

    const existing = state.exercises[exerciseId];
    let prompt = `💪 ${exercise.name}\n\nВведите вес и повторения:\n\`80 10\` — 80кг, 10 повторений\n\`80\` — только вес`;

    if (existing) {
      prompt += `\n\n_Текущее: ${existing.weight || '-'}кг × ${existing.reps || '-'}_`;
    }

    await ctx.editMessageText(prompt, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('◀️ К упражнениям', 'workout_back')],
        [Markup.button.callback('❌ Отмена', 'menu_main')],
      ]),
    });
  });

  // Back to exercise selection
  bot.action('workout_back', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const state = userState.get(userId);
    if (state) {
      state.mode = 'workout';
      state.currentExercise = null;
      userState.set(userId, state);
    }

    const recorded = state?.exercises ? Object.keys(state.exercises).length : 0;
    let text = '📝 Тренировка\n\nВыберите упражнение:';
    if (recorded > 0) {
      text += `\n\n_Записано упражнений: ${recorded}_`;
    }

    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...getExerciseButtons() });
  });

  // Finish workout
  bot.action('workout_finish', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const state = userState.get(userId);

    if (!state || !state.exercises || Object.keys(state.exercises).length === 0) {
      await ctx.editMessageText('❌ Нет записанных упражнений', getMainMenu());
      userState.delete(userId);
      return;
    }

    try {
      await sheets.saveWorkout(state.date, state.exercises);
      const count = Object.keys(state.exercises).length;
      userState.delete(userId);
      await ctx.editMessageText(
        `✅ Тренировка сохранена!\n\nЗаписано упражнений: ${count}`,
        getMainMenu()
      );
    } catch (error) {
      console.error('Error saving workout:', error);
      await ctx.editMessageText('❌ Ошибка при сохранении', getMainMenu());
    }
  });

  // Start body composition
  bot.action('body_start', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    userState.set(userId, { mode: 'body_input', date: new Date() });
    await ctx.editMessageText(
      '⚖️ Запись веса\n\n' +
        'Введите данные в формате:\n' +
        '`75.5` — только вес\n' +
        '`75.5 35 15 55` — вес, мышцы, жир, вода',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'menu_main')]]),
      }
    );
  });

  // Stats menu callback
  bot.action('menu_stats', async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.callbackQuery.message?.photo) {
      await ctx.deleteMessage();
      await ctx.reply('📊 Статистика\n\nВыберите раздел:', getStatsMenu());
    } else {
      await ctx.editMessageText('📊 Статистика\n\nВыберите раздел:', getStatsMenu());
    }
  });

  // Exercise selection for stats
  bot.action('stats_exercises', async (ctx) => {
    await ctx.answerCbQuery();
    // If message has photo, delete and send new text message
    if (ctx.callbackQuery.message?.photo) {
      await ctx.deleteMessage();
      await ctx.reply('💪 Прогресс упражнений\n\nВыберите упражнение:', getStatsExerciseButtons());
    } else {
      await ctx.editMessageText('💪 Прогресс упражнений\n\nВыберите упражнение:', getStatsExerciseButtons());
    }
  });

  // Body stats - show period selection
  bot.action('stats_body', async (ctx) => {
    await ctx.answerCbQuery();
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Последние 10', 'bodystat_10'),
        Markup.button.callback('📈 Всё время', 'bodystat_all'),
      ],
      [Markup.button.callback('◀️ Назад', 'menu_stats')],
    ]);
    if (ctx.callbackQuery.message?.photo) {
      await ctx.deleteMessage();
      await ctx.reply('📈 Динамика веса тела\n\nВыберите период:', keyboard);
    } else {
      await ctx.editMessageText('📈 Динамика веса тела\n\nВыберите период:', keyboard);
    }
  });

  // Body stats with period
  bot.action(/^bodystat_(10|all)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const period = ctx.match[1];

    try {
      const allStats = await sheets.getBodyStats();

      if (allStats.length === 0) {
        await ctx.editMessageText(
          '📈 Динамика веса тела\n\nНет данных.',
          Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'menu_stats')]])
        );
        return;
      }

      const stats = period === '10' ? allStats.slice(-10) : allStats;
      const periodLabel = period === '10' ? 'последние 10' : 'всё время';

      let message = `📈 Динамика веса тела (${periodLabel})\n\n`;
      message += '```\n';
      message += 'Дата       | Вес  | Мышцы | Жир  | Вода\n';
      message += '-----------|------|-------|------|------\n';

      // Show max 15 rows in table
      const tableStats = stats.slice(-15);
      for (const entry of tableStats) {
        const date = entry.date.padEnd(10);
        const weight = (entry.weight || '-').toString().padEnd(4);
        const muscle = (entry.muscle || '-').toString().padEnd(5);
        const fat = (entry.fat || '-').toString().padEnd(4);
        const water = (entry.water || '-').toString().padEnd(4);
        message += `${date} | ${weight} | ${muscle} | ${fat} | ${water}\n`;
      }

      message += '```';

      if (stats.length > 15) {
        message += `\n\n_Таблица: последние 15 из ${stats.length}_`;
      }

      // Generate chart
      const labels = stats.map(e => e.date.slice(0, 5)); // DD.MM
      const datasets = [];

      if (stats.some(e => e.weight)) {
        datasets.push({
          label: 'Вес (кг)',
          data: stats.map(e => e.weight ? parseFloat(e.weight) : null),
        });
      }

      // Delete old message and send photo with caption
      await ctx.deleteMessage();

      if (datasets.length > 0) {
        const chartUrl = generateChartUrl(labels, datasets, `Динамика веса тела (${periodLabel})`, 'кг');
        await ctx.replyWithPhoto(chartUrl, {
          caption: message,
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(period === '10' ? '✓ Последние 10' : 'Последние 10', 'bodystat_10'),
              Markup.button.callback(period === 'all' ? '✓ Всё время' : 'Всё время', 'bodystat_all'),
            ],
            [Markup.button.callback('◀️ Назад', 'menu_stats')],
          ]),
        });
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(period === '10' ? '✓ Последние 10' : 'Последние 10', 'bodystat_10'),
              Markup.button.callback(period === 'all' ? '✓ Всё время' : 'Всё время', 'bodystat_all'),
            ],
            [Markup.button.callback('◀️ Назад', 'menu_stats')],
          ]),
        });
      }
    } catch (error) {
      console.error('Error getting body stats:', error);
      await ctx.reply(
        '❌ Ошибка при получении данных',
        Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'menu_stats')]])
      );
    }
  });

  // Exercise stats handler - show period selection
  bot.action(/^exercise_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const exerciseId = ctx.match[1];
    const exercise = getExerciseById(exerciseId);

    if (!exercise) {
      const keyboard = Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'stats_exercises')]]);
      if (ctx.callbackQuery.message?.photo) {
        await ctx.deleteMessage();
        await ctx.reply('❌ Упражнение не найдено', keyboard);
      } else {
        await ctx.editMessageText('❌ Упражнение не найдено', keyboard);
      }
      return;
    }

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('📊 Последние 10', `exstat_${exerciseId}_10`),
        Markup.button.callback('📈 Всё время', `exstat_${exerciseId}_all`),
      ],
      [Markup.button.callback('◀️ Назад', 'stats_exercises')],
    ]);

    if (ctx.callbackQuery.message?.photo) {
      await ctx.deleteMessage();
      await ctx.reply(`💪 ${exercise.name}\n\nВыберите период:`, keyboard);
    } else {
      await ctx.editMessageText(`💪 ${exercise.name}\n\nВыберите период:`, keyboard);
    }
  });

  // Exercise stats with period
  bot.action(/^exstat_(.+)_(10|all)$/, async (ctx) => {
    await ctx.answerCbQuery();

    const exerciseId = ctx.match[1];
    const period = ctx.match[2];
    const exercise = getExerciseById(exerciseId);

    if (!exercise) {
      await ctx.editMessageText(
        '❌ Упражнение не найдено',
        Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'stats_exercises')]])
      );
      return;
    }

    try {
      const allStats = await sheets.getExerciseStats(exerciseId);

      if (allStats.length === 0) {
        await ctx.editMessageText(
          `💪 ${exercise.name}\n\nНет данных.`,
          Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'stats_exercises')]])
        );
        return;
      }

      const stats = period === '10' ? allStats.slice(-10) : allStats;
      const periodLabel = period === '10' ? 'последние 10' : 'всё время';

      let message = `💪 ${exercise.name} (${periodLabel})\n\n`;
      message += '```\n';
      message += 'Дата       | Вес (кг) | Повт.\n';
      message += '-----------|----------|------\n';

      // Show max 15 rows in table
      const tableStats = stats.slice(-15);
      for (const entry of tableStats) {
        const date = entry.date.padEnd(10);
        const weight = (entry.weight || '-').toString().padEnd(8);
        const reps = (entry.reps || '-').toString().padEnd(4);
        message += `${date} | ${weight} | ${reps}\n`;
      }

      message += '```';

      if (stats.length > 15) {
        message += `\n\n_Таблица: последние 15 из ${stats.length}_`;
      }

      // Generate chart with all selected data
      const labels = stats.map(e => e.date.slice(0, 5)); // DD.MM
      const datasets = [{
        label: 'Вес (кг)',
        data: stats.map(e => e.weight ? parseFloat(e.weight) : null),
      }];

      // Delete old message and send photo with caption
      await ctx.deleteMessage();

      const chartUrl = generateChartUrl(labels, datasets, `${exercise.name} (${periodLabel})`, 'кг');
      await ctx.replyWithPhoto(chartUrl, {
        caption: message,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(period === '10' ? '✓ Последние 10' : 'Последние 10', `exstat_${exerciseId}_10`),
            Markup.button.callback(period === 'all' ? '✓ Всё время' : 'Всё время', `exstat_${exerciseId}_all`),
          ],
          [Markup.button.callback('◀️ К упражнениям', 'stats_exercises')],
        ]),
      });
    } catch (error) {
      console.error('Error getting exercise stats:', error);
      await ctx.reply(
        '❌ Ошибка при получении данных',
        Markup.inlineKeyboard([[Markup.button.callback('◀️ Назад', 'stats_exercises')]])
      );
    }
  });

  // Handle text input
  bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userState.get(userId);
    const threadOpts = getThreadOptions(ctx);

    if (!state) {
      return; // No active state, ignore
    }

    const text = ctx.message.text.trim();

    // Exercise input mode
    if (state.mode === 'exercise_input' && state.currentExercise) {
      const parts = text.split(/\s+/);
      const weight = parseFloat(parts[0]);
      const reps = parts[1] ? parseInt(parts[1], 10) : null;

      if (isNaN(weight)) {
        await ctx.reply('❌ Неверный формат. Введите: `80 10` или `80`', {
          parse_mode: 'Markdown',
          ...threadOpts
        });
        return;
      }

      const exercise = getExerciseById(state.currentExercise);
      state.exercises[state.currentExercise] = {
        weight: weight.toString(),
        reps: reps ? reps.toString() : '',
      };
      state.mode = 'workout';
      state.currentExercise = null;
      userState.set(userId, state);

      const recorded = Object.keys(state.exercises).length;
      await ctx.reply(
        `✅ ${exercise.name}: ${weight}кг${reps ? ` × ${reps}` : ''}\n\n` +
          `Записано упражнений: ${recorded}\n` +
          `Выберите следующее или завершите:`,
        { ...getExerciseButtons(), ...threadOpts }
      );
      return;
    }

    // Body composition input mode
    if (state.mode === 'body_input') {
      const parts = text.split(/\s+/).map((p) => parseFloat(p));
      const weight = parts[0];

      if (isNaN(weight)) {
        await ctx.reply('❌ Неверный формат. Введите: `75.5` или `75.5 35 15 55`', {
          parse_mode: 'Markdown',
          ...threadOpts
        });
        return;
      }

      const bodyData = {
        weight: weight.toString(),
        muscle: parts[1] && !isNaN(parts[1]) ? parts[1].toString() : '',
        fat: parts[2] && !isNaN(parts[2]) ? parts[2].toString() : '',
        water: parts[3] && !isNaN(parts[3]) ? parts[3].toString() : '',
      };

      try {
        await sheets.saveBodyComposition(state.date, bodyData);
        userState.delete(userId);

        let msg = `✅ Данные сохранены!\n\nВес: ${weight}кг`;
        if (bodyData.muscle) msg += `\nМышцы: ${bodyData.muscle}кг`;
        if (bodyData.fat) msg += `\nЖир: ${bodyData.fat}кг`;
        if (bodyData.water) msg += `\nВода: ${bodyData.water}%`;

        await ctx.reply(msg, { ...getMainMenu(), ...threadOpts });
      } catch (error) {
        console.error('Error saving body composition:', error);
        await ctx.reply('❌ Ошибка при сохранении', { ...getMainMenu(), ...threadOpts });
      }
      return;
    }
  });

  return bot;
}

module.exports = { createBot };
