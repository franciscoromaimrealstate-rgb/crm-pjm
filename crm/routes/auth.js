const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign } = require('../auth');

const r = express.Router();

r.post('/login', (req, res) => {
  const { email, password, sobre_password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  const u = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email.trim().toLowerCase());
  if (!u || !bcrypt.compareSync(password, u.password_hash))
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  // Sobrecontraseña: si el usuario la tiene configurada, es obligatoria
  if (u.sobre_password_hash) {
    if (!sobre_password) return res.status(401).json({ error: 'sobre_password_requerida', mensaje: 'Ingresa tu sobrecontraseña' });
    if (!bcrypt.compareSync(sobre_password, u.sobre_password_hash))
      return res.status(401).json({ error: 'Sobrecontraseña incorrecta' });
  }
  const token = sign({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, folio: u.folio });
  res.json({ token, user: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, folio: u.folio } });
});

// Admin impersona asesor
r.post('/impersonate/:id', require('../auth').middleware, require('../auth').adminOnly, (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id=? AND activo=1').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });
  const token = sign({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, folio: u.folio });
  res.json({ token, user: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, folio: u.folio } });
});

// Configurar sobrecontraseña propia
r.post('/sobre-password', require('../auth').middleware, (req, res) => {
  const { sobre_password } = req.body;
  if (!sobre_password || sobre_password.length < 4)
    return res.status(400).json({ error: 'Mínimo 4 caracteres' });
  const hash = bcrypt.hashSync(sobre_password, 10);
  db.prepare('UPDATE usuarios SET sobre_password_hash=? WHERE id=?').run(hash, req.user.id);
  res.json({ ok: true });
});


module.exports = r;
