const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const dbPath = process.env.NODE_ENV === 'production'
  ? '/data/pjm.db'
  : path.join(__dirname, '../pjm.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'asesor',
  inmobiliaria TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  activo INTEGER DEFAULT 1,
  folio TEXT UNIQUE,
  token TEXT UNIQUE,
  fecha_alta DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lid TEXT UNIQUE,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  tipo_usuario TEXT DEFAULT '',
  nombre TEXT DEFAULT '',
  telefono_wa TEXT DEFAULT '',
  telefono_contacto TEXT DEFAULT '',
  inmobiliaria TEXT DEFAULT '',
  intencion TEXT DEFAULT '',
  renta TEXT DEFAULT '',
  tipo_inmueble TEXT DEFAULT '',
  zona TEXT DEFAULT '',
  seguro TEXT DEFAULT '',
  investigaciones TEXT DEFAULT '',
  tipo_contrato TEXT DEFAULT '',
  tipo_firma TEXT DEFAULT '',
  folio_poliza TEXT DEFAULT '',
  folio_arrendamiento TEXT DEFAULT '',
  asesor_id INTEGER REFERENCES usuarios(id),
  asesor_nombre TEXT DEFAULT '',
  estado TEXT DEFAULT 'Nuevo',
  motivo_perdida TEXT DEFAULT '',
  plan_vendido TEXT DEFAULT '',
  prox_seguimiento TEXT DEFAULT '',
  notas TEXT DEFAULT '',
  fuente TEXT DEFAULT 'whatsapp',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS guardias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT NOT NULL,
  turno TEXT NOT NULL,
  asesor_id INTEGER REFERENCES usuarios(id),
  asesor_nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS llamadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  asesor_id INTEGER REFERENCES usuarios(id),
  asesor_nombre TEXT DEFAULT '',
  nombre_cliente TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  tipo TEXT DEFAULT '',
  intencion TEXT DEFAULT '',
  renta TEXT DEFAULT '',
  inmueble TEXT DEFAULT '',
  zona TEXT DEFAULT '',
  resultado TEXT DEFAULT '',
  cotizar INTEGER DEFAULT 0,
  notas TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS expedientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT UNIQUE,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  tipo_contratacion TEXT DEFAULT 'poliza',
  asesor_id INTEGER REFERENCES usuarios(id),
  asesor_nombre TEXT DEFAULT '',
  -- Inmueble
  tipo_inmueble TEXT DEFAULT '',
  uso_inmueble TEXT DEFAULT '',
  direccion_inmueble TEXT DEFAULT '',
  monto_renta TEXT DEFAULT '',
  amueblado INTEGER DEFAULT 0,
  inventario TEXT DEFAULT '',
  formato_firma TEXT DEFAULT '',
  -- Partes
  num_arrendadores INTEGER DEFAULT 1,
  num_arrendatarios INTEGER DEFAULT 1,
  num_os INTEGER DEFAULT 0,
  tiene_habitante INTEGER DEFAULT 0,
  -- Contactos para notificaciones
  tel_arrendador TEXT DEFAULT '',
  email_arrendador TEXT DEFAULT '',
  nombre_arrendador TEXT DEFAULT '',
  tel_arrendatario TEXT DEFAULT '',
  email_arrendatario TEXT DEFAULT '',
  nombre_arrendatario TEXT DEFAULT '',
  -- Estatus
  estatus_general TEXT DEFAULT 'Nuevo',
  estatus_poliza TEXT DEFAULT '',
  estatus_arrendamiento TEXT DEFAULT '',
  estatus_expediente TEXT DEFAULT '',
  estatus_operacion TEXT DEFAULT '',
  investigacion_aprobada TEXT DEFAULT '',
  tipo_poliza TEXT DEFAULT '',
  -- Folios
  folio_expediente TEXT DEFAULT '',
  folio_poliza TEXT DEFAULT '',
  folio_arrendamiento TEXT DEFAULT '',
  folio_anexo TEXT DEFAULT '',
  folio_recibo TEXT DEFAULT '',
  folio_opinion TEXT DEFAULT '',
  folio_devolucion TEXT DEFAULT '',
  -- Fechas
  inicio_poliza TEXT DEFAULT '',
  fin_poliza TEXT DEFAULT '',
  inicio_arrendamiento TEXT DEFAULT '',
  fin_arrendamiento TEXT DEFAULT '',
  -- Financiero
  os_aval TEXT DEFAULT '',
  cantidad_devuelta TEXT DEFAULT '',
  motivo_devolucion TEXT DEFAULT '',
  fecha_devolucion TEXT DEFAULT '',
  notas TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS solicitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folio TEXT UNIQUE,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  expediente_id INTEGER REFERENCES expedientes(id),
  tipo TEXT NOT NULL,
  asesor_id INTEGER REFERENCES usuarios(id),
  asesor_nombre TEXT DEFAULT '',
  nombre TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  rfc TEXT DEFAULT '',
  curp TEXT DEFAULT '',
  datos TEXT DEFAULT '{}',
  estado TEXT DEFAULT 'Recibida',
  notas_internas TEXT DEFAULT '',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitud_id INTEGER REFERENCES solicitudes(id),
  expediente_id INTEGER REFERENCES expedientes(id),
  nombre TEXT DEFAULT '',
  descripcion TEXT DEFAULT '',
  tipo_archivo TEXT DEFAULT '',
  datos_base64 TEXT DEFAULT '',
  tamano INTEGER DEFAULT 0,
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recordatorios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expediente_id INTEGER REFERENCES expedientes(id),
  folio_expediente TEXT DEFAULT '',
  dias_antes INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  enviado_wa_arrendador INTEGER DEFAULT 0,
  enviado_wa_arrendatario INTEGER DEFAULT 0,
  enviado_wa_asesor INTEGER DEFAULT 0,
  enviado_email_arrendador INTEGER DEFAULT 0,
  enviado_email_arrendatario INTEGER DEFAULT 0,
  fecha_envio DATETIME,
  fecha_vencimiento TEXT DEFAULT '',
  UNIQUE(expediente_id, dias_antes)
);
`);

// Migraciones: agregar columnas si no existen
try { db.exec('ALTER TABLE usuarios ADD COLUMN token TEXT'); } catch {}
try { db.exec('ALTER TABLE usuarios ADD COLUMN inmobiliaria TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE usuarios ADD COLUMN telefono TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN num_op INTEGER'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN nombre_arrendador TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN tel_arrendador TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN email_arrendador TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN nombre_arrendatario TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN tel_arrendatario TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN email_arrendatario TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN folio_investigacion TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN folio_anexo TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN estatus_expediente TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE expedientes ADD COLUMN estatus_operacion TEXT DEFAULT ""'); } catch {}

// Seed admin
const admin = db.prepare('SELECT id FROM usuarios WHERE rol = ?').get('admin');
if (!admin) {
  const hash = bcrypt.hashSync('pjm2024admin', 10);
  const tok = crypto.randomBytes(16).toString('hex');
  db.prepare(`INSERT INTO usuarios (nombre,email,password_hash,rol,folio,token) VALUES (?,?,?,?,?,?)`)
    .run('Administrador PJM', 'admin@pjm.com', hash, 'admin', 'ADMIN', tok);
  console.log('✅ Admin creado: admin@pjm.com / pjm2024admin');
}

// Asegurar tokens para todos los usuarios
const sinToken = db.prepare('SELECT id FROM usuarios WHERE token IS NULL').all();
for (const u of sinToken) {
  db.prepare('UPDATE usuarios SET token = ? WHERE id = ?')
    .run(crypto.randomBytes(16).toString('hex'), u.id);
}

module.exports = db;
