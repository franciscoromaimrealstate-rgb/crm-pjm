const express = require('express');
const path = require('path');
const cors = require('cors');

require('./db'); // init DB

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth',        require('./routes/auth'));
app.use('/api/leads',       require('./routes/leads'));
app.use('/api/asesores',    require('./routes/asesores'));
app.use('/api/guardias',    require('./routes/guardias'));
app.use('/api/dashboard',   require('./routes/dashboard'));
app.use('/api/llamadas',    require('./routes/llamadas'));
app.use('/api/expedientes', require('./routes/expedientes'));
app.use('/api/solicitudes',      require('./routes/solicitudes'));
app.use('/api/incumplimientos', require('./routes/incumplimientos'));
app.use('/api/quejas',          require('./routes/quejas'));
app.use('/api/juridico',        require('./routes/juridico'));

// Portal asesor (link único por token)
app.get('/s/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal-asesor.html')));

// Ruta pública de búsqueda por folio (sin auth)
app.get('/api/folios/:q', (req, res) => {
  const db = require('./db');
  const q = req.params.q.toUpperCase().trim();
  const exp = db.prepare(`
    SELECT folio, folio_poliza, folio_arrendamiento, folio_recibo, folio_investigacion,
           folio_opinion, folio_devolucion, folio_anexo, num_op,
           estatus_general, estatus_poliza, estatus_arrendamiento, estatus_expediente, estatus_operacion,
           tipo_contratacion, inicio_arrendamiento, fin_arrendamiento, asesor_nombre,
           direccion_inmueble, tipo_inmueble, monto_renta, updated_at
    FROM expedientes WHERE
      folio=? OR folio_poliza=? OR folio_arrendamiento=? OR folio_recibo=? OR
      folio_opinion=? OR folio_investigacion=? OR folio_anexo=? OR
      folio LIKE ? OR folio_poliza LIKE ? OR folio_arrendamiento LIKE ? OR folio_recibo LIKE ?
    LIMIT 1
  `).get(q,q,q,q,q,q,q,`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);
  if (exp) return res.json({ tipo: 'expediente', ...exp });
  const sol = db.prepare('SELECT folio, tipo, nombre, estado, fecha, updated_at FROM solicitudes WHERE folio=? OR folio LIKE ?').get(q, `%${q}%`);
  if (sol) return res.json({ tipo: 'solicitud', ...sol });
  res.status(404).json({ error: 'Folio no encontrado' });
});

// Portal cliente
app.get('/mi-expediente', (req, res) => res.sendFile(path.join(__dirname, 'public', 'mi-expediente.html')));

// Rutas CRM
app.get('/crm',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'crm-login.html')));
app.get('/crm.html',(req, res) => res.sendFile(path.join(__dirname, 'public', 'crm.html')));

// Todo lo demás → página PJM
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🌐 CRM PJM corriendo en http://localhost:${PORT}`));

module.exports = app;
