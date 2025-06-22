const express = require('express');
const router = express.Router();
const pool = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const checkRole = require('../middleware/checkRole');

// Дашборд по всем пользователям (только для admin)
router.get('/users', authMiddleware, checkRole('admin'), async (req, res) => {
  try {
    const usersResult = await pool.query('SELECT id, name, email, role FROM users');
    const users = usersResult.rows;

    const detailedUsers = await Promise.all(users.map(async user => {
      const [projects, projectTasks, assignedTasks] = await Promise.all([
        pool.query(`
          SELECT DISTINCT p.*
          FROM projects p
          LEFT JOIN project_participants pp ON p.id = pp.project_id
          WHERE p.owner_id = $1 OR pp.user_id = $1
        `, [user.id]),
        pool.query(`
          SELECT DISTINCT t.*
          FROM tasks t
          JOIN projects p ON t.project_id = p.id
          LEFT JOIN project_participants pp ON p.id = pp.project_id
          WHERE p.owner_id = $1 OR pp.user_id = $1
        `, [user.id]),
        pool.query(`
          SELECT * FROM tasks WHERE assigned_to = $1
        `, [user.id])
      ]);

      return {
        ...user,
        projects: projects.rows,
        projectTasks: projectTasks.rows,
        assignedTasks: assignedTasks.rows,
      };
    }));

    res.json(detailedUsers);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка загрузки дашборда' });
  }
});

// Персональный дашборд (для текущего пользователя)
router.get('/', authMiddleware, async (req, res) => {
  const userId = req.user.userId;

  try {
    // Получить проекты, где пользователь участвует или владеет
    const projects = await pool.query(`
      SELECT DISTINCT p.*
      FROM projects p
      LEFT JOIN project_participants pp ON p.id = pp.project_id
      WHERE p.owner_id = $1 OR pp.user_id = $1
    `, [userId]);

    // Получить только задачи, назначенные лично этому пользователю
    const assignedTasks = await pool.query(`
      SELECT * FROM tasks WHERE assigned_to = $1
    `, [userId]);

    res.json({
      projects: projects.rows,
      assignedTasks: assignedTasks.rows
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Ошибка загрузки персонального дашборда' });
  }
});


module.exports = router;
