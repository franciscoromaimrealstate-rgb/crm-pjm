const express = require('express');
const db = require('../db');
const { middleware, adminOnly } = require('../auth');

const r = express.Router();
r.use(middleware);

r.get('/', (req, res) => {
  const { desde, hasta } = req.query;
  let q = 'SELECT g.*, u.nombre as asesor_nombre_real FROM guardias g LEFT JOIN usuarios u ON g.asesor_id = u.id WHERE 1=1';
  const p = [];
  if (desde) { q += ' AND g.fecha >= ?'; p.push(desde); }
  if (hasta) { q += ' AND g.fecha <= ?'; p.push(hasta); }
  q += ' ORDER BY g.fecha, g.turno';
  res.json(db.prepare(q).all(...p));
});

r.post('/', adminOnly, (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const ins = db.prepare('INSERT OR REPLACE INTO guardias (fecha,turno,asesor_id,asesor_nombre) VALUES (?,?,?,?)');
  const del = db.prepare('DELETE FROM guardias WHERE fecha = ? AND turno = ?');
  const tx = db.transaction(() => {
    for (const item of items) {
      del.run(item.fecha, item.turno);
      if (item.asesor_id) {
        const u = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(item.asesor_id);
        ins.run(item.fecha, item.turno, item.asesor_id, u?.nombre || item.asesor_nombre || '');
      }
    }
  });
  tx();
  res.json({ ok: true });
});

r.delete('/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM guardias WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Get current guardia asesor
r.get('/actual', (req, res) => {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
  const hora = now.getHours() + now.getMinutes() / 60;
  const dia = now.getDay();
  const dd = String(now.getDate()).padStart(2,'0');
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const yyyy = now.getFullYear();
  const fechaStr = `${yyyy}-${mm}-${dd}`;
  let turno = 'manana';
  if (dia === 0 || dia === 6 || (dia === 1 && hora < 14)) turno = 'finde';
  else if (hora >= 14 && hora < 18) turno = 'tarde';
  const g = db.prepare('SELECT * FROM guardias WHERE fecha = ? AND turno = ?').get(fechaStr, turno);
  res.json({ fecha: fechaStr, turno, guardia: g || null });
});

module.exports = r;
