const exercises = [
  { id: 'vertical_pull', name: 'Вертикальная тяга' },
  { id: 'squats', name: 'Приседания со штангой' },
  { id: 'horizontal_pull', name: 'Горизонтальная тяга' },
  { id: 'leg_curl', name: 'Сгибание ног лежа' },
  { id: 'bench_press', name: 'Жим лежа' },
  { id: 'biceps', name: 'Бицепс' },
  { id: 'gravitron', name: 'Гравитрон' },
  { id: 'butterfly', name: 'Бабочка' },
  { id: 'triceps', name: 'Трицепс' },
  { id: 'abs', name: 'Пресс' },
  { id: 'shoulder_dumbbells', name: 'Гантели на плечи' },
];

function getExerciseById(id) {
  return exercises.find((e) => e.id === id);
}

function getExerciseByName(name) {
  return exercises.find((e) => e.name === name);
}

module.exports = {
  exercises,
  getExerciseById,
  getExerciseByName,
};
