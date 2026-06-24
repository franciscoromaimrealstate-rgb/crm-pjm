const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { middleware, adminOnly } = require('../auth');

const r = express.Router();
r.use(middleware);

// ── FOLIO INTELIGENTE ──
// Todos los documentos de una operación comparten el mismo NNN
// PJM-YY-MM-P031 (póliza), PJM-YY-MM-A031 (arrendamiento), etc.
function getNextNumOp() {
  const row = db.prepare('SELECT MAX(num_op) as mx FROM expedientes WHERE num_op IS NOT NULL').get();
  return (row?.mx || 0) + 1;
}

function generarFolios(numOp, fecha) {
  const d = fecha ? new Date(fecha + 'T12:00:00') : new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const nnn = String(numOp).padStart(3, '0');
  return {
    num_op: numOp,
    folio:                `PJM-${yy}-${mm}-E${nnn}`,   // Expediente (master)
    folio_poliza:         `PJM-${yy}-${mm}-P${nnn}`,
    folio_arrendamiento:  `PJM-${yy}-${mm}-A${nnn}`,
    folio_recibo:         `PJM-${yy}-${mm}-R${nnn}`,
    folio_opinion:        `PJM-${yy}-${mm}-O${nnn}`,
    folio_devolucion:     `PJM-${yy}-${mm}-D${nnn}`,
    folio_anexo:          `PJM-${yy}-${mm}-X${nnn}`,
    folio_investigacion:  `PJM-${yy}-${mm}-I${nnn}`,
  };
}

// Busca por CUALQUIER tipo de folio → devuelve el expediente completo
r.get('/buscar-folio/:q', (req, res) => {
  const q = req.params.q.toUpperCase().trim();
  const exp = db.prepare(`
    SELECT * FROM expedientes WHERE
      folio = ? OR folio_poliza = ? OR folio_arrendamiento = ? OR
      folio_recibo = ? OR folio_opinion = ? OR folio_devolucion = ? OR
      folio_anexo = ? OR folio_investigacion = ? OR
      folio LIKE ? OR folio_poliza LIKE ? OR folio_arrendamiento LIKE ?
    LIMIT 1
  `).get(q, q, q, q, q, q, q, q, `%${q}%`, `%${q}%`, `%${q}%`);
  if (!exp) return res.status(404).json({ error: 'No encontrado' });
  exp.solicitudes = db.prepare('SELECT id,folio,tipo,nombre,estado FROM solicitudes WHERE expediente_id=?').all(exp.id);
  res.json(exp);
});

r.get('/', (req, res) => {
  const { estado, search } = req.query;
  let q = 'SELECT * FROM expedientes WHERE 1=1';
  const p = [];
  // Asesor solo ve sus expedientes
  if (req.user.rol !== 'admin') { q += ' AND asesor_id = ?'; p.push(req.user.id); }
  if (estado) { q += ' AND estatus_general = ?'; p.push(estado); }
  if (search) {
    q += ` AND (folio LIKE ? OR folio_poliza LIKE ? OR folio_arrendamiento LIKE ?
           OR folio_recibo LIKE ? OR folio_investigacion LIKE ?
           OR asesor_nombre LIKE ? OR direccion_inmueble LIKE ?
           OR nombre_arrendador LIKE ? OR nombre_arrendatario LIKE ?)`;
    const s = `%${search}%`;
    p.push(s,s,s,s,s,s,s,s,s);
  }
  q += ' ORDER BY num_op DESC, id DESC';
  const exps = db.prepare(q).all(...p);
  for (const exp of exps) {
    exp.solicitudes_count = db.prepare('SELECT COUNT(*) as c FROM solicitudes WHERE expediente_id=?').get(exp.id)?.c || 0;
  }
  res.json(exps);
});

r.get('/:id', (req, res) => {
  const exp = db.prepare('SELECT * FROM expedientes WHERE id = ?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'No encontrado' });
  exp.solicitudes = db.prepare('SELECT * FROM solicitudes WHERE expediente_id=? ORDER BY id').all(exp.id);
  exp.documentos = db.prepare('SELECT id,nombre,descripcion,tipo_archivo,tamano,fecha FROM documentos WHERE expediente_id=? ORDER BY id').all(exp.id);
  exp.recordatorios = db.prepare('SELECT * FROM recordatorios WHERE expediente_id=? ORDER BY dias_antes DESC').all(exp.id);
  res.json(exp);
});

r.post('/', (req, res) => {
  const d = req.body;
  const numOp = getNextNumOp();
  // Fecha del expediente determina el YY-MM de todos los folios
  const folios = generarFolios(numOp, d.fecha_operacion || null);

  const row = db.prepare(`INSERT INTO expedientes (
    num_op, folio, folio_poliza, folio_arrendamiento, folio_recibo,
    folio_opinion, folio_devolucion, folio_anexo, folio_investigacion,
    tipo_contratacion, asesor_id, asesor_nombre,
    tipo_inmueble, uso_inmueble, direccion_inmueble, monto_renta,
    amueblado, inventario, formato_firma,
    nombre_arrendador, tel_arrendador, email_arrendador,
    nombre_arrendatario, tel_arrendatario, email_arrendatario,
    num_arrendadores, num_arrendatarios, num_os, tiene_habitante,
    estatus_general, notas
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    folios.num_op, folios.folio, folios.folio_poliza, folios.folio_arrendamiento,
    folios.folio_recibo, folios.folio_opinion, folios.folio_devolucion,
    folios.folio_anexo, folios.folio_investigacion,
    d.tipo_contratacion || 'poliza',
    d.asesor_id || null, d.asesor_nombre || '',
    d.tipo_inmueble || '', d.uso_inmueble || '',
    d.direccion_inmueble || '', d.monto_renta || '',
    d.amueblado ? 1 : 0, d.inventario || '', d.formato_firma || '',
    d.nombre_arrendador || '', d.tel_arrendador || '', d.email_arrendador || '',
    d.nombre_arrendatario || '', d.tel_arrendatario || '', d.email_arrendatario || '',
    d.num_arrendadores || 1, d.num_arrendatarios || 1, d.num_os || 0,
    d.tiene_habitante ? 1 : 0, d.estatus_general || 'Nuevo', d.notas || ''
  );
  res.json({ id: row.lastInsertRowid, ...folios });
});

r.put('/:id', (req, res) => {
  const exp = db.prepare('SELECT * FROM expedientes WHERE id=?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'No encontrado' });
  // Asesor solo puede editar sus propios expedientes y campos no financieros
  if (req.user.rol !== 'admin' && exp.asesor_id !== req.user.id)
    return res.status(403).json({ error: 'Sin permiso' });

  const d = req.body;
  const camposAsesor = [
    'tipo_contratacion','tipo_inmueble','uso_inmueble','direccion_inmueble','monto_renta',
    'amueblado','inventario','formato_firma',
    'nombre_arrendador','tel_arrendador','email_arrendador',
    'nombre_arrendatario','tel_arrendatario','email_arrendatario',
    'num_arrendadores','num_arrendatarios','num_os','tiene_habitante',
    'estatus_general','tipo_poliza',
    'inicio_poliza','fin_poliza','inicio_arrendamiento','fin_arrendamiento','notas'
  ];
  const camposAdmin = [
    ...camposAsesor,
    'asesor_id','asesor_nombre',
    'estatus_poliza','estatus_arrendamiento','estatus_expediente','estatus_operacion',
    'investigacion_aprobada','resultado_opinion','workflow_etapa',
    'folio_poliza','folio_arrendamiento','folio_recibo','folio_anexo',
    'folio_opinion','folio_devolucion','folio_investigacion',
    'os_aval','cantidad_devuelta','motivo_devolucion','fecha_devolucion',
    'ingreso_total','comision_porcentaje','comision_monto'
  ];
  const campos = req.user.rol === 'admin' ? camposAdmin : camposAsesor;
  const unique = [...new Set(campos)];
  const sets = unique.filter(f => d[f] !== undefined).map(f => `${f}=?`);
  const vals = unique.filter(f => d[f] !== undefined).map(f => d[f]);
  if (sets.length) {
    sets.push('updated_at=CURRENT_TIMESTAMP');
    db.prepare(`UPDATE expedientes SET ${sets.join(',')} WHERE id=?`).run(...vals, req.params.id);
  }
  res.json(db.prepare('SELECT * FROM expedientes WHERE id=?').get(req.params.id));
});

// ── WORKFLOW: enviar link al arrendatario ──
r.post('/:id/link-arrendatario', (req, res) => {
  const exp = db.prepare('SELECT * FROM expedientes WHERE id=?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'No encontrado' });
  if (req.user.rol !== 'admin' && exp.asesor_id !== req.user.id)
    return res.status(403).json({ error: 'Sin permiso' });
  let token = exp.token_arrendatario;
  if (!token) {
    token = crypto.randomBytes(20).toString('hex');
    db.prepare('UPDATE expedientes SET token_arrendatario=?, workflow_etapa="arrendatario_enviado" WHERE id=?').run(token, exp.id);
  }
  const host = process.env.APP_URL || `http://localhost:${process.env.PORT||3001}`;
  res.json({ link: `${host}/solicitud.html?token_exp=${token}&etapa=arrendatario`, token });
});

// ── WORKFLOW: enviar link al arrendador (solo si opinión es positiva) ──
r.post('/:id/link-arrendador', adminOnly, (req, res) => {
  const exp = db.prepare('SELECT * FROM expedientes WHERE id=?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'No encontrado' });
  let token = exp.token_arrendador;
  if (!token) {
    token = crypto.randomBytes(20).toString('hex');
    db.prepare('UPDATE expedientes SET token_arrendador=?, workflow_etapa="arrendador_enviado" WHERE id=?').run(token, exp.id);
  }
  const host = process.env.APP_URL || `http://localhost:${process.env.PORT||3001}`;
  res.json({ link: `${host}/solicitud.html?token_exp=${token}&etapa=arrendador`, token });
});

r.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM recordatorios WHERE expediente_id=?').run(req.params.id);
  db.prepare('DELETE FROM documentos WHERE expediente_id=?').run(req.params.id);
  db.prepare('DELETE FROM solicitudes WHERE expediente_id=?').run(req.params.id);
  db.prepare('DELETE FROM expedientes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Ruta pública: buscar por cualquier folio (para mi-expediente.html)
r.get('/publico/:q', (req, res) => {
  // Sin auth — solo campos no sensibles
  const q = req.params.q.toUpperCase().trim();
  const exp = db.prepare(`
    SELECT folio, folio_poliza, folio_arrendamiento, folio_recibo, folio_investigacion,
           estatus_general, estatus_poliza, estatus_arrendamiento, estatus_expediente,
           tipo_contratacion, inicio_arrendamiento, fin_arrendamiento, asesor_nombre, updated_at
    FROM expedientes WHERE
      folio=? OR folio_poliza=? OR folio_arrendamiento=? OR folio_recibo=? OR
      folio_opinion=? OR folio_investigacion=? OR
      folio LIKE ? OR folio_poliza LIKE ? OR folio_arrendamiento LIKE ?
    LIMIT 1
  `).get(q, q, q, q, q, q, `%${q}%`, `%${q}%`, `%${q}%`);
  if (exp) return res.json({ tipo: 'expediente', ...exp });

  const sol = db.prepare('SELECT folio, tipo, nombre, estado, fecha, updated_at FROM solicitudes WHERE folio=? OR folio LIKE ?').get(q, `%${q}%`);
  if (sol) return res.json({ tipo: 'solicitud', ...sol });

  res.status(404).json({ error: 'Folio no encontrado' });
});

module.exports = r;
