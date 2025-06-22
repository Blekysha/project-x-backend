const jwt = require('jsonwebtoken');
const JWT_SECRET = 'your_jwt_secret_key';  // Лучше тоже вынеси в .env

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Нет токена авторизации' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;  // прикрепляем данные пользователя к запросу
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Неверный токен' });
  }
}

module.exports = authMiddleware;
