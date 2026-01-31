const { google } = require('googleapis');
const config = require('./config');
const { exercises } = require('./exercises');

let sheetsClient = null;

async function getClient() {
  if (sheetsClient) {
    return sheetsClient;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: config.google.credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function parseDate(dateStr) {
  const [day, month, year] = dateStr.split('.');
  return new Date(year, month - 1, day);
}

// Build header row for workout sheet
function getWorkoutHeaders() {
  const headers = ['Дата'];
  for (const exercise of exercises) {
    headers.push(`${exercise.name} (кг)`);
    headers.push(`${exercise.name} (повт)`);
  }
  return headers;
}

// Initialize sheets with headers if needed
async function initializeSheets() {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  // Check if sheets exist
  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = spreadsheet.data.sheets.map((s) => s.properties.title);

    // Create workout sheet if not exists
    if (!sheetNames.includes(config.sheets.workoutSheet)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: config.sheets.workoutSheet },
              },
            },
          ],
        },
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${config.sheets.workoutSheet}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [getWorkoutHeaders()],
        },
      });
    }

    // Create body composition sheet if not exists
    if (!sheetNames.includes(config.sheets.bodySheet)) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: config.sheets.bodySheet },
              },
            },
          ],
        },
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${config.sheets.bodySheet}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [
            [
              'Дата',
              'Вес (кг)',
              'Скелетная мускулатура (кг)',
              'Жировая ткань (кг)',
              'Вода (%)',
            ],
          ],
        },
      });
    }
  } catch (error) {
    console.error('Error initializing sheets:', error.message);
    throw error;
  }
}

// Save workout data
async function saveWorkout(date, workoutData) {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  const row = [formatDate(date)];
  for (const exercise of exercises) {
    const data = workoutData[exercise.id] || {};
    row.push(data.weight || '');
    row.push(data.reps || '');
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${config.sheets.workoutSheet}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  });
}

// Get last workout
async function getLastWorkout() {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheets.workoutSheet}!A:ZZ`,
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) {
    return null;
  }

  const lastRow = rows[rows.length - 1];
  const rowIndex = rows.length; // 1-indexed row number

  const workout = {
    date: lastRow[0],
    rowIndex,
    exercises: {},
  };

  for (let i = 0; i < exercises.length; i++) {
    const exercise = exercises[i];
    const weightIdx = 1 + i * 2;
    const repsIdx = 2 + i * 2;

    if (lastRow[weightIdx] || lastRow[repsIdx]) {
      workout.exercises[exercise.id] = {
        weight: lastRow[weightIdx] || '',
        reps: lastRow[repsIdx] || '',
      };
    }
  }

  return workout;
}

// Update existing workout row
async function updateWorkout(rowIndex, date, workoutData) {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  const row = [formatDate(date)];
  for (const exercise of exercises) {
    const data = workoutData[exercise.id] || {};
    row.push(data.weight || '');
    row.push(data.reps || '');
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${config.sheets.workoutSheet}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  });
}

// Save body composition data
async function saveBodyComposition(date, bodyData) {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  const row = [
    formatDate(date),
    bodyData.weight || '',
    bodyData.muscle || '',
    bodyData.fat || '',
    bodyData.water || '',
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${config.sheets.bodySheet}!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  });
}

// Get last body composition
async function getLastBodyComposition() {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheets.bodySheet}!A:E`,
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) {
    return null;
  }

  const lastRow = rows[rows.length - 1];
  const rowIndex = rows.length;

  return {
    date: lastRow[0],
    rowIndex,
    weight: lastRow[1] || '',
    muscle: lastRow[2] || '',
    fat: lastRow[3] || '',
    water: lastRow[4] || '',
  };
}

// Update existing body composition row
async function updateBodyComposition(rowIndex, date, bodyData) {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  const row = [
    formatDate(date),
    bodyData.weight || '',
    bodyData.muscle || '',
    bodyData.fat || '',
    bodyData.water || '',
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${config.sheets.bodySheet}!A${rowIndex}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [row],
    },
  });
}

// Get exercise statistics
async function getExerciseStats(exerciseId) {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheets.workoutSheet}!A:ZZ`,
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) {
    return [];
  }

  const exerciseIndex = exercises.findIndex((e) => e.id === exerciseId);
  if (exerciseIndex === -1) {
    return [];
  }

  const weightIdx = 1 + exerciseIndex * 2;
  const repsIdx = 2 + exerciseIndex * 2;

  const stats = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[weightIdx] || row[repsIdx]) {
      stats.push({
        date: row[0],
        weight: row[weightIdx] || '',
        reps: row[repsIdx] || '',
      });
    }
  }

  return stats;
}

// Get body composition history
async function getBodyStats() {
  const sheets = await getClient();
  const spreadsheetId = config.google.spreadsheetId;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${config.sheets.bodySheet}!A:E`,
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) {
    return [];
  }

  const stats = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    stats.push({
      date: row[0],
      weight: row[1] || '',
      muscle: row[2] || '',
      fat: row[3] || '',
      water: row[4] || '',
    });
  }

  return stats;
}

module.exports = {
  initializeSheets,
  saveWorkout,
  getLastWorkout,
  updateWorkout,
  saveBodyComposition,
  getLastBodyComposition,
  updateBodyComposition,
  getExerciseStats,
  getBodyStats,
};
