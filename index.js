// 1. Импорты
const express = require('express');
const app = express();
const pool = require('./db');

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
const tasksRouter = require('./routes/tasks');
app.use('/tasks', tasksRouter);

const projectsRouter = require('./routes/projects');
app.use('/projects', projectsRouter);

const usersRouter = require('./routes/users');
app.use('/users', usersRouter);

const dashboardRoutes = require('./routes/dashboard');
app.use('/dashboard', dashboardRoutes);

// 4. Главный маршрут
app.get('/', (req, res) => {
  res.send('Project-X backend is running');
});

// 5. Запуск сервера
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
