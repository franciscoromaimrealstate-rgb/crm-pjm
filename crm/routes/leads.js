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
  if (search) {
    q += ' AND (nombre LIKE ? OR telefono_wa LIKE ? OR telefono_contacto LIKE ? OR lid LIKE ?)';
    const s = `%${search}%`; p.push(s,s,s,s);
  }
  if (desde) { q += ' AND fecha >= ?'; p.push(desde); }
  if (hasta) { q += ' AND fecha <= ?'; p.push(hasta + ' 23:59:59'); }
  q += ' ORDER BY id DESC';
  res.json(db.prepare(q).all(...p));
});

r.get('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'No encontrado' });
  if (req.user.rol !== 'admin' && lead.asesor_id !== req.user.id)
    return res.status(403).json({ error: 'Sin permiso' });
  lead.notas_log = db.prepare('SELECT * FROM lead_notas WHERE lead_id=? ORDER BY id').all(lead.id);
  res.json(lead);
});

r.post('/', (req, res) => {
  const u = req.user;
  const d = req.body;

  // Anti-duplicado: bloquea si teléfono o nombre ya existe
  const tel = (d.telefono_wa || d.telefono_contacto || '').trim();
  const nom = (d.nombre || '').trim().toLowerCase();
  if (tel) {
    const dup = db.prepare(
      'SELECT lid, nombre, asesor_nombre, fecha FROM leads WHERE telefono_wa=? OR telefono_contacto=? LIMIT 1'
    ).get(tel, tel);
    if (dup) return res.status(409).json({
      error: 'duplicado',
      mensaje: `Este teléfono ya fue registrado como ${dup.lid} (${dup.nombre}) por ${dup.asesor_nombre} el ${dup.fecha?.slice(0,10)}`,
      lead: dup
    });
  }
  if (nom) {
    const dup = db.prepare(
      'SELECT lid, nombre, asesor_nombre, fecha FROM leads WHERE LOWER(nombre)=? LIMIT 1'
    ).get(nom);
    if (dup) return res.status(409).json({
      error: 'duplicado',
      mensaje: `Este nombre ya fue registrado como ${dup.lid} por ${dup.asesor_nombre} el ${dup.fecha?.slice(0,10)}`,
      lead: dup
    });
  }

  const lid = nextLid();
  const asesor_id = u.rol === 'admin' ? (d.asesor_id || u.id) : u.id;
  const asesorRow = db.prepare('SELECT nombre FROM usuarios WHERE id = ?').get(asesor_id);
  const row = db.prepare(`INSERT INTO leads
    (lid,tipo_usuario,nombre,telefono_wa,telefono_contacto,inmobiliaria,intencion,renta,tipo_inmueble,zona,seguro,investigaciones,tipo_contrato,tipo_firma,folio_poliza,folio_arrendamiento,asesor_id,asesor_nombre,estado,motivo_perdida,plan_vendido,prox_seguimiento,fuente)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(lid, d.tipo_usuario||'', d.nombre||'', d.telefono_wa||'', d.telefono_contacto||'', d.inmobiliaria||'',
      d.intencion||'', d.renta||'', d.tipo_inmueble||'', d.zona||'', d.seguro||'', d.investigaciones||'',
      d.tipo_contrato||'', d.tipo_firma||'', d.folio_poliza||'', d.folio_arrendamiento||'',
      asesor_id, asesorRow?.nombre || '', d.estado||'Nuevo', d.motivo_perdida||'', d.plan_vendido||'',
      d.prox_seguimiento||'', d.fuente||'manual');

  // Si viene nota inicial, guardarla en log
  if (d.notas && d.notas.trim()) {
    db.prepare('INSERT INTO lead_notas (lead_id,texto,usuario_nombre) VALUES (?,?,?)')
      .run(row.lastInsertRowid, d.notas.trim(), u.nombre);
  }

  res.json(db.prepare('SELECT * FROM leads WHERE id = ?').get(row.lastInsertRowid));
});

r.put('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead no encontrado' });
  if (req.user.rol !== 'admin' && lead.asesor_id !== req.user.id)
    return res.status(403).json({ error: 'Sin permiso' });

  const d = req.body;

  // Campos NUNCA editables: nombre, telefono_wa, telefono_contacto, lid
  // Asesor solo puede editar: estado, prox_seguimiento, plan_vendido, motivo_perdida, intencion, renta, zona
  // Admin puede editar todo excepto nombre y teléfono
  const camposAsesor = ['estado','prox_seguimiento','plan_vendido','motivo_perdida','intencion','renta','zona','tipo_inmueble','seguro','investigaciones','tipo_contrato','tipo_firma'];
  const camposAdmin = [...camposAsesor, 'tipo_usuario','inmobiliaria','folio_poliza','folio_arrendamiento','asesor_id','asesor_nombre','fuente'];
  const permitidos = req.user.rol === 'admin' ? camposAdmin : camposAsesor;

  const sets = permitidos.filter(f => d[f] !== undefined).map(f => `${f} = ?`);
  const vals = permitidos.filter(f => d[f] !== undefined).map(f => d[f]);
  if (sets.length) {
    sets.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  }

  // Nota nueva: siempre se agrega al log, nunca se reemplaza
  if (d.nota_nueva && d.nota_nueva.trim()) {
    db.prepare('INSERT INTO lead_notas (lead_id,texto,usuario_nombre) VALUES (?,?,?)')
      .run(req.params.id, d.nota_nueva.trim(), req.user.nombre);
  }

  const updated = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  updated.notas_log = db.prepare('SELECT * FROM lead_notas WHERE lead_id=? ORDER BY id').all(updated.id);
  res.json(updated);
});

// Notas: GET historial
r.get('/:id/notas', (req, res) => {
  const lead = db.prepare('SELECT id, asesor_id FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'No encontrado' });
  if (req.user.rol !== 'admin' && lead.asesor_id !== req.user.id)
    return res.status(403).json({ error: 'Sin permiso' });
  res.json(db.prepare('SELECT * FROM lead_notas WHERE lead_id=? ORDER BY id').all(req.params.id));
});

// Notas: POST agregar (append-only)
r.post('/:id/notas', (req, res) => {
  const lead = db.prepare('SELECT id, asesor_id FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) return res.status(404).json({ error: 'No encontrado' });
  if (req.user.rol !== 'admin' && lead.asesor_id !== req.user.id)
    return res.status(403).json({ error: 'Sin permiso' });
  const { texto } = req.body;
  if (!texto?.trim()) return res.status(400).json({ error: 'Texto requerido' });
  db.prepare('INSERT INTO lead_notas (lead_id,texto,usuario_nombre) VALUES (?,?,?)')
    .run(req.params.id, texto.trim(), req.user.nombre);
  res.json(db.prepare('SELECT * FROM lead_notas WHERE lead_id=? ORDER BY id').all(req.params.id));
});

// NO hay DELETE de leads

module.exports = r;
