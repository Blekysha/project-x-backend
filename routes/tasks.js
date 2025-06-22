const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

// Валидация входящих данных
function validateTask(data) {
  const errors = [];
  if (!data.title || typeof data.title !== 'string') {
    errors.push('Title is required and must be a string.');
  }
  if (data.status && !['todo', 'in-progress', 'done'].includes(data.status)) {
    errors.push('Status must be one of: todo, in-progress, done.');
  }
  if (!data.project_id || isNaN(Number(data.project_id))) {
    errors.push('Valid project_id is required.');
  }
  return errors;
}

// Получить задачи, где пользователь связан с проектом
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(`
      SELECT t.*
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN project_participants pp ON p.id = pp.project_id
      WHERE p.owner_id = $1 OR pp.user_id = $1
      ORDER BY t.created_at DESC
    `, [userId]);

    const tasks = await Promise.all(result.rows.map(async task => {
      const assignees = await pool.query(`
        SELECT u.id, u.name, u.email
        FROM task_assignees ta
        JOIN users u ON ta.user_id = u.id
        WHERE ta.task_id = $1
      `, [task.id]);

      return { ...task, assignees: assignees.rows };
    }));

    res.json(tasks);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить одну задачу по ID
router.get('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const taskResult = await pool.query(`
      SELECT t.*
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN project_participants pp ON p.id = pp.project_id
      WHERE t.id = $1 AND (p.owner_id = $2 OR pp.user_id = $2)
    `, [id, userId]);

    if (taskResult.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к этой задаче' });
    }

    const task = taskResult.rows[0];

    const assignees = await pool.query(`
      SELECT u.id, u.name, u.email
      FROM task_assignees ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id = $1
    `, [id]);

    res.json({ ...task, assignees: assignees.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Создать задачу
router.post('/', authMiddleware, async (req, res) => {
  const { title, description = '', status = 'todo', project_id } = req.body;
  const errors = validateTask({ title, status, project_id });

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  try {
    const accessCheck = await pool.query(`
      SELECT p.*
      FROM projects p
      LEFT JOIN project_participants pp ON p.id = pp.project_id
      WHERE p.id = $1 AND (p.owner_id = $2 OR pp.user_id = $2)
    `, [project_id, req.user.userId]);

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Нет прав для добавления задачи в этот проект' });
    }

    const newTask = await pool.query(`
      INSERT INTO tasks (title, description, status, project_id)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [title, description, status, project_id]);

    res.status(201).json(newTask.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Назначить участника на задачу
router.post('/:taskId/assignees', authMiddleware, async (req, res) => {
  const { taskId } = req.params;
  const { user_id } = req.body;

  if (!user_id) return res.status(400).json({ error: 'Не указан user_id' });

  try {
    const accessCheck = await pool.query(`
      SELECT p.*
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN project_participants pp ON p.id = pp.project_id
      WHERE t.id = $1 AND (p.owner_id = $2 OR pp.user_id = $2)
    `, [taskId, req.user.userId]);

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Нет прав добавлять исполнителей' });
    }

    const alreadyAssigned = await pool.query(`
      SELECT * FROM task_assignees WHERE task_id = $1 AND user_id = $2
    `, [taskId, user_id]);

    if (alreadyAssigned.rows.length > 0) {
      return res.status(400).json({ error: 'Пользователь уже назначен' });
    }

    await pool.query(`
      INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)
    `, [taskId, user_id]);

    res.status(201).json({ message: 'Пользователь назначен' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновить задачу
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { title, description = '', status } = req.body;

  if (!title || (status && !['todo', 'in-progress', 'done'].includes(status))) {
    return res.status(400).json({ error: 'Некорректные данные' });
  }

  try {
    const accessCheck = await pool.query(`
      SELECT t.*
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      LEFT JOIN project_participants pp ON p.id = pp.project_id
      WHERE t.id = $1 AND (p.owner_id = $2 OR pp.user_id = $2)
    `, [id, req.user.userId]);

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к задаче' });
    }

    const updated = await pool.query(`
      UPDATE tasks
      SET title = $1, description = $2, status = $3, updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [title, description, status, id]);

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить задачу
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const accessCheck = await pool.query(`
      SELECT t.*, p.owner_id
      FROM tasks t
      JOIN projects p ON t.project_id = p.id
      WHERE t.id = $1
    `, [id]);

    const task = accessCheck.rows[0];
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    if (task.owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Нет прав на удаление' });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ message: 'Задача удалена' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

module.exports = router;
