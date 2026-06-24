const express = require('express');
const db = require('../db');
const { middleware, adminOnly } = require('../auth');

const r = express.Router();
r.use(middleware);

r.get('/', (req, res) => {
  const { estatus } = req.query;
  let q = 'SELECT * FROM incumplimientos WHERE 1=1';
  const p = [];
  if (estatus) { q += ' AND estatus=?'; p.push(estatus); }
  q += ' ORDER BY id DESC';
  res.json(db.prepare(q).all(...p));
});

r.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM incumplimientos WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

r.post('/', (req, res) => {
  const d = req.body;
  const info = db.prepare(`INSERT INTO incumplimientos
    (expediente_id,folio,tipo,estatus,resultado,asesor_id,asesor_nombre,nombre_arrendatario,notas,fecha_inicio,fecha_resolucion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    d.expediente_id||null, d.folio||'', d.tipo||'', d.estatus||'en_gestion', d.resultado||'',
    d.asesor_id||req.user.id, d.asesor_nombre||req.user.nombre,
    d.nombre_arrendatario||'', d.notas||'', d.fecha_inicio||'', d.fecha_resolucion||''
  );
  res.json({ id: info.lastInsertRowid });
});

r.put('/:id', (req, res) => {
  const d = req.body;
  const campos = ['tipo','estatus','resultado','asesor_id','asesor_nombre','nombre_arrendatario','notas','fecha_inicio','fecha_resolucion'];
  const sets = campos.filter(f => d[f] !== undefined).map(f => `${f}=?`);
  const vals = campos.filter(f => d[f] !== undefined).map(f => d[f]);
  if (sets.length) {
    sets.push('updated_at=CURRENT_TIMESTAMP');
    db.prepare(`UPDATE incumplimientos SET ${sets.join(',')} WHERE id=?`).run(...vals, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM incumplimientos WHERE id=?').get(req.params.id));
});

r.delete('/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM incumplimientos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = r;
