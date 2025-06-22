const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/checkRole');

// Получить все проекты, в которых участвует пользователь или которые он создал
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await pool.query(`
      SELECT DISTINCT p.*
      FROM projects p
      LEFT JOIN project_participants pp ON pp.project_id = p.id
      WHERE p.owner_id = $1 OR pp.user_id = $1
    `, [userId]);

    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Получить проект по ID (если пользователь владелец или участник)
router.get('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(`
      SELECT * FROM projects
      WHERE id = $1 AND (
        owner_id = $2 OR EXISTS (
          SELECT 1 FROM project_participants WHERE project_id = $1 AND user_id = $2
        )
      )
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(403).json({ msg: 'Нет доступа к этому проекту' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Получить проект, задачи и участников (если пользователь связан с проектом)
router.get('/:id/full', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    // Проверка доступа
    const accessCheck = await pool.query(`
      SELECT * FROM projects p
      LEFT JOIN project_participants pp ON p.id = pp.project_id
      WHERE p.id = $1 AND (p.owner_id = $2 OR pp.user_id = $2)
    `, [id, userId]);

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к этому проекту' });
    }

    const project = accessCheck.rows[0];

    // Получаем задачи проекта
    const tasksResult = await pool.query('SELECT * FROM tasks WHERE project_id = $1', [id]);
    const tasks = tasksResult.rows;

    // Получаем всех исполнителей задач этого проекта
    const assigneesResult = await pool.query(`
      SELECT ta.task_id, u.id, u.name, u.email
      FROM task_assignees ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id IN (${tasks.map(t => t.id).join(',') || 'NULL'})
    `);

    // Группируем исполнителей по task_id
    const assigneesMap = {};
    for (const row of assigneesResult.rows) {
      if (!assigneesMap[row.task_id]) {
        assigneesMap[row.task_id] = [];
      }
      assigneesMap[row.task_id].push(row.id);
    }

    // Добавляем assigned_to как массив
    const tasksWithAssignees = tasks.map(task => ({
      ...task,
      assigned_to: assigneesMap[task.id] || []
    }));

    // Получаем участников проекта
    const participantsResult = await pool.query(`
      SELECT u.id, u.name, u.email, u.role
      FROM project_participants pp
      JOIN users u ON pp.user_id = u.id
      WHERE pp.project_id = $1
    `, [id]);

    res.json({
      project,
      tasks: tasksWithAssignees,
      participants: participantsResult.rows
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка при получении проекта' });
  }
});


// Получить краткую информацию о проекте (без задач и участников)
router.get('/:id/info', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.userId;

  try {
    const result = await pool.query(`
      SELECT * FROM projects
      WHERE id = $1 AND (
        owner_id = $2 OR EXISTS (
          SELECT 1 FROM project_participants WHERE project_id = $1 AND user_id = $2
        )
      )
    `, [id, userId]);

    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к проекту' });
    }

    res.json({ project: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка при получении информации' });
  }
});

// Создать проект (только manager и teamlead)
router.post('/', authMiddleware, checkRole('manager', 'teamlead'), async (req, res) => {
  const { name, description } = req.body;
  const owner_id = req.user.userId;

  try {
    const newProject = await pool.query(
      'INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, owner_id]
    );
    res.status(201).json(newProject.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Обновить проект
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    const result = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    const project = result.rows[0];

    if (!project) {
      return res.status(404).json({ msg: 'Проект не найден' });
    }

    if (project.owner_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Недостаточно прав' });
    }

    const updated = await pool.query(
      'UPDATE projects SET name = $1, description = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [name, description, id]
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Удалить проект
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    const project = result.rows[0];

    if (!project) {
      return res.status(404).json({ msg: 'Проект не найден' });
    }

    if (project.owner_id !== req.user.userId && req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Недостаточно прав' });
    }

    await pool.query('DELETE FROM projects WHERE id = $1', [id]);
    res.json({ msg: 'Проект удалён' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server error');
  }
});

// Добавить участника (только для manager и teamlead)
router.post('/:projectId/participants', authMiddleware, (req, res, next) => {
  const allowed = ['manager', 'teamlead'];
  if (!req.user || !allowed.includes(req.user.role)) {
    return res.status(403).json({ message: 'Недостаточно прав' });
  }
  next();
}, async (req, res) => {
  const { projectId } = req.params;
  const { user_id } = req.body;

  try {
    const exists = await pool.query(
      'SELECT * FROM project_participants WHERE user_id = $1 AND project_id = $2',
      [user_id, projectId]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ message: 'Пользователь уже участвует' });
    }

    const result = await pool.query(
      'INSERT INTO project_participants (user_id, project_id) VALUES ($1, $2) RETURNING *',
      [user_id, projectId]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка при добавлении участника' });
  }
});

module.exports = router;
