const express = require('express');
const db = require('../db');
const { middleware } = require('../auth');

const r = express.Router();
r.use(middleware);

r.get('/', (req, res) => {
  const isAdmin = req.user.rol === 'admin';
  let q = 'SELECT * FROM llamadas WHERE 1=1';
  const p = [];
  if (!isAdmin) { q += ' AND asesor_id = ?'; p.push(req.user.id); }
  q += ' ORDER BY id DESC';
  res.json(db.prepare(q).all(...p));
});

r.post('/', (req, res) => {
  const d = req.body;
  const asesor_id = req.user.id;
  const asesor_nombre = req.user.nombre;
  const row = db.prepare(`INSERT INTO llamadas
    (asesor_id,asesor_nombre,nombre_cliente,telefono,tipo,intencion,renta,inmueble,zona,resultado,cotizar,notas)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(asesor_id, asesor_nombre, d.nombre_cliente||'', d.telefono||'', d.tipo||'',
      d.intencion||'', d.renta||'', d.inmueble||'', d.zona||'', d.resultado||'',
      d.cotizar ? 1 : 0, d.notas||'');
  res.json({ id: row.lastInsertRowid });
});

r.delete('/:id', (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });
  db.prepare('DELETE FROM llamadas WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = r;
