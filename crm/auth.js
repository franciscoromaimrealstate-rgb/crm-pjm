const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'pjm_secret_2024_xK9m';

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '12h' });
}

function middleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  next();
}

module.exports = { sign, middleware, adminOnly };
