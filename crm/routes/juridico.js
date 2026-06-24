const express = require('express');
const db = require('../db');
const { middleware, adminOnly } = require('../auth');

const r = express.Router();
r.use(middleware);

r.get('/', (req, res) => {
  const { estatus } = req.query;
  let q = 'SELECT * FROM casos_juridicos WHERE 1=1';
  const p = [];
  if (estatus) { q += ' AND estatus=?'; p.push(estatus); }
  q += ' ORDER BY id DESC';
  res.json(db.prepare(q).all(...p));
});

r.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM casos_juridicos WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  res.json(row);
});

r.post('/', (req, res) => {
  const d = req.body;
  const info = db.prepare(`INSERT INTO casos_juridicos
    (expediente_id,folio,tipo,estatus,sentencia,monto_reclamado,monto_recuperado,asesor_id,asesor_nombre,nombre_arrendatario,juzgado,notas,fecha_inicio,fecha_resolucion)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    d.expediente_id||null, d.folio||'', d.tipo||'', d.estatus||'activo',
    d.sentencia||'', d.monto_reclamado||'', d.monto_recuperado||'',
    d.asesor_id||null, d.asesor_nombre||'', d.nombre_arrendatario||'',
    d.juzgado||'', d.notas||'', d.fecha_inicio||'', d.fecha_resolucion||''
  );
  res.json({ id: info.lastInsertRowid });
});

r.put('/:id', (req, res) => {
  const d = req.body;
  const campos = ['tipo','estatus','sentencia','monto_reclamado','monto_recuperado','asesor_id','asesor_nombre','nombre_arrendatario','juzgado','notas','fecha_inicio','fecha_resolucion'];
  const sets = campos.filter(f => d[f] !== undefined).map(f => `${f}=?`);
  const vals = campos.filter(f => d[f] !== undefined).map(f => d[f]);
  if (sets.length) {
    sets.push('updated_at=CURRENT_TIMESTAMP');
    db.prepare(`UPDATE casos_juridicos SET ${sets.join(',')} WHERE id=?`).run(...vals, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM casos_juridicos WHERE id=?').get(req.params.id));
});

r.delete('/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM casos_juridicos WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = r;
