const express = require('express');
const db = require('../db');
const { middleware, adminOnly } = require('../auth');

const r = express.Router();
r.use(middleware);

r.get('/', (req, res) => {
  const { estatus } = req.query;
  let q = 'SELECT * FROM quejas WHERE 1=1';
  const p = [];
  if (estatus) { q += ' AND estatus=?'; p.push(estatus); }
  q += ' ORDER BY id DESC';
  res.json(db.prepare(q).all(...p));
});

r.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM quejas WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

r.post('/', (req, res) => {
  const d = req.body;
  const info = db.prepare(`INSERT INTO quejas
    (tipo_reclamante,nombre_reclamante,tipo,estatus,asesor_id,asesor_nombre,expediente_id,descripcion,resolucion,fecha_apertura,fecha_resolucion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    d.tipo_reclamante||'', d.nombre_reclamante||'', d.tipo||'', d.estatus||'abierta',
    d.asesor_id||null, d.asesor_nombre||'', d.expediente_id||null,
    d.descripcion||'', d.resolucion||'', d.fecha_apertura||'', d.fecha_resolucion||''
  );
  res.json({ id: info.lastInsertRowid });
});

r.put('/:id', (req, res) => {
  const d = req.body;
  const campos = ['tipo_reclamante','nombre_reclamante','tipo','estatus','asesor_id','asesor_nombre','expediente_id','descripcion','resolucion','fecha_apertura','fecha_resolucion'];
  const sets = campos.filter(f => d[f] !== undefined).map(f => `${f}=?`);
  const vals = campos.filter(f => d[f] !== undefined).map(f => d[f]);
  if (sets.length) {
    sets.push('updated_at=CURRENT_TIMESTAMP');
    db.prepare(`UPDATE quejas SET ${sets.join(',')} WHERE id=?`).run(...vals, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM quejas WHERE id=?').get(req.params.id));
});

r.delete('/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM quejas WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = r;
