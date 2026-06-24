const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { middleware, adminOnly } = require('../auth');

const r = express.Router();

// Ruta pública — sin auth
r.get('/por-token/:token', (req, res) => {
  const u = db.prepare('SELECT id,nombre,folio,inmobiliaria,telefono FROM usuarios WHERE token = ? AND activo = 1').get(req.params.token);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  res.json(u);
});

r.use(middleware);

r.get('/', (req, res) => {
  const rows = db.prepare('SELECT id,nombre,email,rol,inmobiliaria,telefono,activo,folio,fecha_alta FROM usuarios ORDER BY nombre').all();
  res.json(rows);
});

r.get('/:id', (req, res) => {
  const u = db.prepare('SELECT id,nombre,email,rol,inmobiliaria,telefono,activo,folio,fecha_alta FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No encontrado' });
  // Stats
  const stats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN estado='Ganado' THEN 1 ELSE 0 END) as ganados,
    SUM(CASE WHEN estado='Perdido' THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN estado='En Proceso' THEN 1 ELSE 0 END) as en_proceso
    FROM leads WHERE asesor_id = ?`).get(req.params.id);
  res.json({ ...u, stats });
});

r.post('/', adminOnly, (req, res) => {
  const { nombre, email, password, inmobiliaria, telefono, rol } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Nombre, email y contraseña requeridos' });
  const last = db.prepare("SELECT folio FROM usuarios WHERE folio LIKE 'PJM-A-%' ORDER BY id DESC LIMIT 1").get();
  const n = last ? parseInt(last.folio.replace('PJM-A-','')) + 1 : 101;
  const folio = `PJM-A-${String(n).padStart(3,'0')}`;
  const hash = bcrypt.hashSync(password, 10);
  try {
    const row = db.prepare(`INSERT INTO usuarios (nombre,email,password_hash,rol,inmobiliaria,telefono,folio) VALUES (?,?,?,?,?,?,?)`)
      .run(nombre, email.toLowerCase(), hash, rol||'asesor', inmobiliaria||'', telefono||'', folio);
    res.json({ id: row.lastInsertRowid, folio });
  } catch (e) {
    res.status(400).json({ error: 'Email ya registrado' });
  }
});

r.put('/:id', adminOnly, (req, res) => {
  const { nombre, email, inmobiliaria, telefono, activo, rol, password } = req.body;
  const sets = []; const vals = [];
  if (nombre !== undefined) { sets.push('nombre=?'); vals.push(nombre); }
  if (email !== undefined) { sets.push('email=?'); vals.push(email.toLowerCase()); }
  if (inmobiliaria !== undefined) { sets.push('inmobiliaria=?'); vals.push(inmobiliaria); }
  if (telefono !== undefined) { sets.push('telefono=?'); vals.push(telefono); }
  if (activo !== undefined) { sets.push('activo=?'); vals.push(activo ? 1 : 0); }
  if (rol !== undefined) { sets.push('rol=?'); vals.push(rol); }
  if (password) { sets.push('password_hash=?'); vals.push(bcrypt.hashSync(password, 10)); }
  if (!sets.length) return res.json({ ok: true });
  db.prepare(`UPDATE usuarios SET ${sets.join(',')} WHERE id = ?`).run(...vals, req.params.id);
  res.json({ ok: true });
});

module.exports = r;
