const express = require('express');
const db = require('../db');
const { middleware, adminOnly } = require('../auth');

const r = express.Router();
r.use(middleware);

function nextLid() {
  const row = db.prepare("SELECT lid FROM leads WHERE lid LIKE 'PJM-L-%' ORDER BY id DESC LIMIT 1").get();
  if (!row) return 'PJM-L-001';
  const n = parseInt(row.lid.replace('PJM-L-', '')) + 1;
  return `PJM-L-${String(n).padStart(3, '0')}`;
}

r.get('/', (req, res) => {
  const { estado, fuente, asesor_id, search, desde, hasta } = req.query;
  let q = 'SELECT * FROM leads WHERE 1=1';
  const p = [];
  if (req.user.rol !== 'admin') { q += ' AND asesor_id = ?'; p.push(req.user.id); }
  else if (asesor_id) { q += ' AND asesor_id = ?'; p.push(asesor_id); }
  if (estado) { q += ' AND estado = ?'; p.push(estado); }
  if (fuente) { q += ' AND fuente = ?'; p.push(fuente); }
  if (search) { q += ' AND (nombre LIKE ? OR telefono_wa LIKE ? OR telefono_contacto LIKE ? OR lid LIKE ?)'; const s = `%${search}%`; p.push(s,s,s,s); }
  if (desde) { q += ' AND fecha >= ?'; p.push(desde); }
  if (hasta) { q += ' AND fecha <= ?'; p.push(hasta + ' 23:59:59'); }
  q += ' ORDER BY id DESC';
  res.json(db.prepare(q).all(...p));
});

r.post('/', (req, res) => {
  const lid = nextLid();
  const u = req.user;
  const d = req.body;
  const asesor_id = u.rol === 'admin' ? (d.asesor_id || u.id) : u.id;
  const asesorRow = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(asesor_id);
  const row = db.prepare(`INSERT INTO leads
    (lid,tipo_usuario,nombre,telefono_wa,telefono_contacto,inmobiliaria,intencion,renta,tipo_inmueble,zona,seguro,investigaciones,tipo_contrato,tipo_firma,folio_poliza,folio_arrendamiento,asesor_id,asesor_nombre,estado,motivo_perdida,plan_vendido,prox_seguimiento,notas,fuente)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(lid, d.tipo_usuario||'', d.nombre||'', d.telefono_wa||'', d.telefono_contacto||'', d.inmobiliaria||'',
      d.intencion||'', d.renta||'', d.tipo_inmueble||'', d.zona||'', d.seguro||'', d.investigaciones||'',
      d.tipo_contrato||'', d.tipo_firma||'', d.folio_poliza||'', d.folio_arrendamiento||'',
      asesor_id, asesorRow?.nombre || '', d.estado||'Nuevo', d.motivo_perdida||'', d.plan_vendido||'',
      d.prox_seguimiento||'', d.notas||'', d.fuente||'manual');
  res.json(db.prepare('SELECT * FROM leads WHERE id = ?').get(row.lastInsertRowid));
});

r.put('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  if (req.user.rol !== 'admin' && lead.asesor_id !== req.user.id)
    return res.status(403).json({ error: 'Sin permiso' });
  const d = req.body;
  const fields = ['tipo_usuario','nombre','telefono_wa','telefono_contacto','inmobiliaria','intencion','renta',
    'tipo_inmueble','zona','seguro','investigaciones','tipo_contrato','tipo_firma','folio_poliza',
    'folio_arrendamiento','estado','motivo_perdida','plan_vendido','prox_seguimiento','notas'];
  if (req.user.rol === 'admin') fields.push('asesor_id','asesor_nombre','fuente');
  const sets = fields.filter(f => d[f] !== undefined).map(f => `${f} = ?`);
  const vals = fields.filter(f => d[f] !== undefined).map(f => d[f]);
  if (!sets.length) return res.json(lead);
  sets.push('updated_at = CURRENT_TIMESTAMP');
  db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  res.json(db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id));
});

r.delete('/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = r;
