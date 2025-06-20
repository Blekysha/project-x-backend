// 1. Импорты
const express = require('express');
const app = express();
const pool = require('./db');
const usersRouter = require('./routes/users');

app.use(express.json());

// 2. Проверка подключения к базе
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Ошибка подключения к базе:', err);
  } else {
    console.log('Подключение к базе успешно:', res.rows[0]);
  }
});

// 3. Роуты
app.use('/users', usersRouter);

// 4. Главный маршрут
app.get('/', (req, res) => {
  res.send('Project-X backend is running');
});

// 5. Запуск сервера
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
