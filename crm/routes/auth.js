const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign } = require('../auth');

const r = express.Router();

r.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email.trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password, u.password_hash))
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  const token = sign({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, folio: u.folio });
  res.json({ token, user: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, folio: u.folio } });
});


module.exports = r;
