const express = require('express');
const router = express.Router();
const pool = require('../db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'your_jwt_secret_key';  // для продакшена лучше хранить в .env

// Получить всех пользователей (без паролей)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при получении пользователей');
  }
});

// Регистрация с проверкой email и хешированием пароля
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Проверка, есть ли пользователь с таким email
    const userCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userCheck.rows.length > 0) {
      return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
    }

    // Хешируем пароль
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создаём пользователя
    const result = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email',
      [name, email, hashedPassword]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при регистрации');
  }
});

// Логин и выдача JWT токена
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Неверный email или пароль' });
    }

    const user = userResult.rows[0];

    // Сравниваем пароль с хешем
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Неверный email или пароль' });
    }

    // Создаем JWT с payload, например, userId и роль (если есть)
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role || 'user' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при входе');
  }
});

// Удаление пользователя (оставим как есть)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).send('Пользователь не найден');
    }

    res.send(`Пользователь с id=${id} удалён`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при удалении пользователя');
  }
});

module.exports = router;
