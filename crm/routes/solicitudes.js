const express = require('express');
const db = require('../db');
const { middleware, adminOnly } = require('../auth');

const r = express.Router();

function nextFolioSol() {
  const row = db.prepare("SELECT folio FROM solicitudes WHERE folio LIKE 'SOL-%' ORDER BY id DESC LIMIT 1").get();
  if (!row) return 'SOL-001';
  const n = parseInt(row.folio.replace('SOL-', '')) + 1;
  return `SOL-${String(n).padStart(3, '0')}`;
}

// Ruta pública: recibir formulario de cliente (via token de asesor)
r.post('/publica', (req, res) => {
  const { asesor_token, tipo, datos } = req.body;
  if (!tipo || !datos) return res.status(400).json({ error: 'Datos incompletos' });

  let asesor = null;
  if (asesor_token) {
    asesor = db.prepare('SELECT id, nombre FROM usuarios WHERE token = ? AND activo = 1').get(asesor_token);
  }

  const folio = nextFolioSol();
  const datosStr = typeof datos === 'string' ? datos : JSON.stringify(datos);
  const parsed = typeof datos === 'string' ? JSON.parse(datos) : datos;

  const row = db.prepare(`INSERT INTO solicitudes
    (folio, tipo, asesor_id, asesor_nombre, nombre, email, telefono, rfc, curp, datos, estado)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    folio, tipo,
    asesor?.id || null, asesor?.nombre || '',
    parsed.nombre || '', parsed.email || '', parsed.telefono || '',
    parsed.rfc || '', parsed.curp || '',
    datosStr, 'Recibida'
  );
  res.json({ ok: true, folio, id: row.lastInsertRowid });
});

// Ruta pública: verificar estatus de expediente por folio
r.get('/mi-expediente/:folio', (req, res) => {
  const folio = req.params.folio.toUpperCase();
  const exp = db.prepare('SELECT folio, estatus_general, estatus_poliza, estatus_expediente, estatus_operacion, inicio_arrendamiento, fin_arrendamiento, tipo_contratacion, asesor_nombre, updated_at FROM expedientes WHERE folio = ?').get(folio);
  if (exp) return res.json({ tipo: 'expediente', ...exp });

  const sol = db.prepare('SELECT folio, tipo, nombre, estado, fecha, updated_at FROM solicitudes WHERE folio = ?').get(folio);
  if (sol) return res.json({ tipo: 'solicitud', ...sol });

  res.status(404).json({ error: 'Folio no encontrado' });
});

// Rutas protegidas (admin/asesor)
r.use(middleware);

r.get('/', (req, res) => {
  const user = req.user;
  let q = 'SELECT * FROM solicitudes WHERE 1=1';
  const p = [];
  if (user.rol !== 'admin') { q += ' AND asesor_id = ?'; p.push(user.id); }
  if (req.query.tipo) { q += ' AND tipo = ?'; p.push(req.query.tipo); }
  if (req.query.estado) { q += ' AND estado = ?'; p.push(req.query.estado); }
  if (req.query.search) { q += ' AND (folio LIKE ? OR nombre LIKE ? OR email LIKE ?)'; const s = `%${req.query.search}%`; p.push(s,s,s); }
  q += ' ORDER BY id DESC';
  res.json(db.prepare(q).all(...p));
});

r.get('/:id', (req, res) => {
  const sol = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'No encontrado' });
  sol.documentos = db.prepare('SELECT id, nombre, descripcion, tipo_archivo, tamano, fecha FROM documentos WHERE solicitud_id = ?').all(sol.id);
  res.json(sol);
});

r.put('/:id', (req, res) => {
  if (req.user.rol !== 'admin') return res.status(403).json({ error: 'Sin permiso' });
  const d = req.body;
  const fields = ['expediente_id','estado','notas_internas','nombre','email','telefono','datos'];
  const sets = fields.filter(f => d[f] !== undefined).map(f => `${f}=?`);
  const vals = fields.filter(f => d[f] !== undefined).map(f => f === 'datos' && typeof d[f] !== 'string' ? JSON.stringify(d[f]) : d[f]);
  if (sets.length) {
    sets.push('updated_at=CURRENT_TIMESTAMP');
    db.prepare(`UPDATE solicitudes SET ${sets.join(',')} WHERE id=?`).run(...vals, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM solicitudes WHERE id=?').get(req.params.id));
});

r.delete('/:id', adminOnly, (req, res) => {
  db.prepare('DELETE FROM documentos WHERE solicitud_id=?').run(req.params.id);
  db.prepare('DELETE FROM solicitudes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Subir documento (base64) a solicitud o expediente
r.post('/:id/documento', (req, res) => {
  const { nombre, descripcion, tipo_archivo, datos_base64, expediente_id } = req.body;
  const tamano = datos_base64 ? Math.round(datos_base64.length * 0.75) : 0;
  const row = db.prepare(`INSERT INTO documentos (solicitud_id, expediente_id, nombre, descripcion, tipo_archivo, datos_base64, tamano)
    VALUES (?,?,?,?,?,?,?)`).run(
    req.params.id, expediente_id || null,
    nombre || 'Documento', descripcion || '', tipo_archivo || '',
    datos_base64 || '', tamano
  );
  res.json({ ok: true, id: row.lastInsertRowid });
});

module.exports = r;
