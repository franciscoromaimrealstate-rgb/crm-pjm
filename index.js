require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const db = require('./crm/db');

// ── HELPERS DB ────────────────────────────────────────────────────────────────
function getAsesorDeGuardia() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
  const hora = now.getHours() + now.getMinutes() / 60;
  const dia = now.getDay();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const dd = String(now.getDate()).padStart(2,'0');
  const fechaStr = `${yyyy}-${mm}-${dd}`;
  let turno = 'manana';
  if (dia === 0 || dia === 6 || (dia === 1 && hora < 14)) turno = 'finde';
  else if (hora >= 14 && hora < 18) turno = 'tarde';
  const g = db.prepare('SELECT * FROM guardias WHERE fecha = ? AND turno = ?').get(fechaStr, turno);
  return g ? { id: g.asesor_id, nombre: g.asesor_nombre } : { id: null, nombre: 'Sin asignar' };
}

function nextLid() {
  const row = db.prepare("SELECT lid FROM leads WHERE lid LIKE 'PJM-L-%' ORDER BY id DESC LIMIT 1").get();
  if (!row) return 'PJM-L-001';
  const n = parseInt(row.lid.replace('PJM-L-', '')) + 1;
  return `PJM-L-${String(n).padStart(3, '0')}`;
}

function crearOActualizarLead(s, estado) {
  const asesor = getAsesorDeGuardia();
  const existing = db.prepare('SELECT id FROM leads WHERE telefono_wa = ? AND estado NOT IN (?,?,?)').get(
    s.telefono, 'Ganado', 'Perdido', 'Incompleto'
  );
  if (existing) {
    db.prepare(`UPDATE leads SET
      tipo_usuario=?,nombre=?,telefono_contacto=?,inmobiliaria=?,intencion=?,
      renta=?,tipo_inmueble=?,zona=?,seguro=?,investigaciones=?,tipo_contrato=?,tipo_firma=?,
      folio_poliza=?,folio_arrendamiento=?,estado=?,asesor_id=?,asesor_nombre=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?`).run(
      s.tipo_usuario||'', s.nombre||'', s.r.telefono_contacto||'', s.inmobiliaria||'', s.intencion||'',
      s.r.renta||'', s.r.tipo||'', s.r.zona||'', s.r.seguro||'', s.r.investigaciones||'',
      s.r.tipoC||'', s.r.firma||'', s.r.folio_poliza||'', s.r.folio_arrendamiento||'',
      estado, asesor.id, asesor.nombre, existing.id
    );
    console.log(`📝 Lead actualizado → ${estado} | Asesor: ${asesor.nombre}`);
  } else {
    const lid = nextLid();
    db.prepare(`INSERT INTO leads
      (lid,telefono_wa,tipo_usuario,nombre,telefono_contacto,inmobiliaria,intencion,
       renta,tipo_inmueble,zona,seguro,investigaciones,tipo_contrato,tipo_firma,
       folio_poliza,folio_arrendamiento,asesor_id,asesor_nombre,estado,fuente)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      lid, s.telefono, s.tipo_usuario||'', s.nombre||'', s.r.telefono_contacto||'', s.inmobiliaria||'', s.intencion||'',
      s.r.renta||'', s.r.tipo||'', s.r.zona||'', s.r.seguro||'', s.r.investigaciones||'',
      s.r.tipoC||'', s.r.firma||'', s.r.folio_poliza||'', s.r.folio_arrendamiento||'',
      asesor.id, asesor.nombre, estado, 'whatsapp'
    );
    console.log(`✅ Nuevo lead ${lid} [${estado}] → Asesor: ${asesor.nombre}`);
  }
}

function registrarPrimerMensaje(tel) {
  const existing = db.prepare('SELECT id FROM leads WHERE telefono_wa = ? AND estado NOT IN (?,?,?)').get(
    tel, 'Ganado', 'Perdido', 'Incompleto'
  );
  if (existing) return;
  const asesor = getAsesorDeGuardia();
  const lid = nextLid();
  db.prepare(`INSERT INTO leads (lid,telefono_wa,asesor_id,asesor_nombre,estado,fuente)
    VALUES (?,?,?,?,?,?)`).run(lid, tel, asesor.id, asesor.nombre, 'Iniciado', 'whatsapp');
  console.log(`🔔 Lead iniciado ${lid} [${tel}] → Asesor: ${asesor.nombre}`);
}

// ── PRECIOS PÓLIZA ────────────────────────────────────────────────────────────
const PRECIOS = [
  { max:10000,    label:'hasta $10,000',   b:'$4,200', p:'$5,200', pr:'$6,500'    },
  { max:30000,    label:'$10,001–$30,000', b:'$5,200', p:'$6,200', pr:'$7,800'    },
  { max:50000,    label:'$30,001–$50,000', b:'$6,200', p:'$7,200', pr:'$9,500'    },
  { max:Infinity, label:'más de $50,000',  b:'20% renta', p:'30% renta', pr:'40% renta' },
];
function rangoPrecios(renta) {
  const n = parseFloat(String(renta).replace(/[,$\s]/g, '')) || 0;
  return PRECIOS.find(x => n <= x.max);
}

// ── MENSAJES ──────────────────────────────────────────────────────────────────
const MENU_INICIO =
`Hola 👋 Bienvenido a *Pólizas Jurídicas Monterrey (PJM)*.

¿Cuál es tu situación?

1️⃣ Soy Arrendador (Propietario)
2️⃣ Soy Arrendatario (Inquilino)
3️⃣ Soy Asesor Inmobiliario`;

function MENU_INTENCION(nombre, asesor) {
  if (asesor) return (
`*${nombre}*, ¿qué te gustaría hacer?

1️⃣ Darme de alta como agente PJM
2️⃣ Cotizar póliza para un cliente
3️⃣ Cotizar investigaciones
4️⃣ Cotizar seguros
5️⃣ Cotizar contrato simple
6️⃣ Cotizar ratificación ante notaría
7️⃣ Administración de inmuebles
8️⃣ Estatus de póliza de un cliente
9️⃣ Hablar con un agente`);
  return (
`Gracias, *${nombre}*. ¿Qué te gustaría hacer?

1️⃣ Cotizar mi póliza
2️⃣ Cotizar investigaciones
3️⃣ Cotizar seguros
4️⃣ Cotizar contrato simple
5️⃣ Cotizar ratificación ante notaría
6️⃣ Administración de inmuebles
7️⃣ Estatus de mi póliza
8️⃣ Hablar con un agente`);
}

const MENU_TIPO =
`¿Qué tipo de inmueble es?

1️⃣ Casa
2️⃣ Departamento
3️⃣ Local comercial
4️⃣ Oficina
5️⃣ Nave industrial / Bodega
6️⃣ Otro — escríbelo`;

const MENU_ZONA = `¿En qué estado se encuentra el inmueble?\n\nEscríbelo directamente. Ej: *Nuevo León*, *Jalisco*, *CDMX*`;
const MENU_SEGUROS =
`¿Qué tipo de seguro te interesa?

1️⃣ Responsabilidad Civil por Daños a Terceros
2️⃣ Seguro para Inmuebles
3️⃣ Seguros Comerciales e Industriales
4️⃣ Seguro Personalizado`;

const MENU_CONTRATO_TIPO =
`¿Qué tipo de contrato necesitas?

1️⃣ Habitacional
2️⃣ Comercial
3️⃣ Industrial
4️⃣ Otro — escríbelo`;

const MENU_CONTRATO_FIRMA =
`¿Qué tipo de firma prefieres?

1️⃣ Firma Digital (desde cualquier lugar, 100% válida)
2️⃣ Firma Presencial (en nuestras oficinas en Monterrey)
3️⃣ Ratificación ante Notaría Pública *(costo adicional)*`;

const MENU_INVESTIGACIONES =
`¿Cuántas investigaciones necesitas?

1️⃣ 1 persona — $500 MXN
2️⃣ 2 personas — $750 MXN
3️⃣ 3 personas — $900 MXN
4️⃣ Personalizado (escribe cuántas)

⚠️ Una persona moral equivale a 2 investigaciones.`;

const TIPOS_INMUEBLE = { '1':'Casa', '2':'Departamento', '3':'Local comercial', '4':'Oficina', '5':'Nave industrial / Bodega' };
const TIPOS_CONTRATO  = { '1':'Habitacional', '2':'Comercial', '3':'Industrial' };
const PRECIOS_INVEST  = { '1':'1 persona — $500 MXN', '2':'2 personas — $750 MXN', '3':'3 personas — $900 MXN' };

const CONTACTO =
`\n\n━━━━━━━━━━━━━━━━━━━━
📞 *812 919 1918*
📧 polizasjuridicasm@gmail.com
📍 Av. Revolución 2703, Monterrey, N.L.
🕘 Lun–Vie 9:00–18:00 | Sáb 9:00–14:00`;

function msgPoliza(renta, tipo, zona) {
  const r = rangoPrecios(renta);
  return (
`Con base en tu inmueble (${tipo} en ${zona}, renta ${r.label}):

📋 *Plan Básico* — ${r.b} | 12 meses
• Investigación paramétrica y legal
• Contrato de arrendamiento
• Firma digital / Seguimiento contractual
• Cobranza y recuperación extrajudicial
• Juicio Oral Civil / Asesoría jurídica

📋 *Plan Plus* — ${r.p} | 13 meses ⭐ Más popular
• Todo lo del Básico
• Mayor cobertura jurídica
• Cobertura honorarios $25,000–$30,000 MXN

📋 *Plan Premium* — ${r.pr} | 13 meses
• Todo lo del Plus
• Recuperación de rentas adeudadas
• Embargo de bienes o salario

Un agente te contactará para guiarte en la mejor elección. 🏠${CONTACTO}`);
}

function msgContrato(renta, tipo, zona, tipoC, firma) {
  const r = rangoPrecios(renta);
  return (
`📄 *Cotización de Contrato Simple — ${tipoC}*
Inmueble: ${tipo} en ${zona} | Renta ${r.label}
Tipo de firma: ${firma}

✓ Redactado por expertos jurídicos
✓ ${firma}
✓ Sin investigación incluida

Un agente te contactará para preparar tu contrato. 📋${CONTACTO}`);
}

function msgRatifContrato(tipo, zona, tipoC) {
  return (
`⚖️ *Ratificación ante Notaría Pública*
Contrato: ${tipoC} | ${tipo} en ${zona}

• Mayor certeza jurídica
• Costo adicional según honorarios de la notaría
• Disponible en Monterrey y principales ciudades

Un agente te contactará para coordinar el proceso. ✅${CONTACTO}`);
}

function msgRatif(tipo, zona) {
  return (
`⚖️ *Cotización de Ratificación ante Notaria Pública*
Inmueble: ${tipo} en ${zona}

• Mayor certeza jurídica para tu contrato
• Costo adicional según honorarios de la notaría
• Disponible en Monterrey y principales ciudades

Un agente te contactará para coordinar tu proceso. ✅${CONTACTO}`);
}

function msgSegInmueble(tipo, zona) {
  return (
`🏠 *Seguro para Inmuebles*
Inmueble: ${tipo} en ${zona}

• Incendio y explosión
• Fenómenos hidrometeorológicos
• Daños estructurales
• Vandalismo y robo

Un agente te contactará para cotizarte. 🤝${CONTACTO}`);
}

function msgAdmin(tipo, zona) {
  return (
`📋 *Administración de Inmuebles — ${tipo} en ${zona}*

💰 Cobranza de rentas
🔍 Supervisión del inmueble
📊 Reportes al propietario
🔧 Atención de incidencias
🧾 Facturación CFDI

Un agente te contactará con detalles y costos. 🏠${CONTACTO}`);
}

const msgAgente = (n) =>
`Perfecto *${n}* ✅

Un agente de PJM te contactará a la brevedad.${CONTACTO}`;

// ── MENSAJE DE SEGUIMIENTO DINÁMICO ──────────────────────────────────────────
function msgSeguimiento(s) {
  const nombre = s.nombre ? `Hola *${s.nombre}*` : 'Hola';
  const intent = s.intencion;
  const textos = {
    cotizar_poliza:    `${nombre}, ¿sigues ahí? Quedaste a un paso de cotizar tu *póliza de arrendamiento* 😊`,
    cotizar_invest:    `${nombre}, ¿sigues ahí? Quedaste a un paso de cotizar tus *investigaciones* 📋`,
    cotizar_seguros:   `${nombre}, ¿sigues ahí? Quedaste a un paso de cotizar tu *seguro* 🛡️`,
    cotizar_contrato:  `${nombre}, ¿sigues ahí? Quedaste a un paso de cotizar tu *contrato de arrendamiento* 📄`,
    cotizar_ratif:     `${nombre}, ¿sigues ahí? Quedaste a un paso de cotizar tu *ratificación ante notaría* ⚖️`,
    administracion:    `${nombre}, ¿sigues ahí? Quedaste a un paso de cotizar la *administración de tu inmueble* 🏠`,
    estatus:           `${nombre}, ¿sigues ahí? Estamos listos para consultar el *estatus de tu póliza* 📂`,
  };
  const msg = textos[intent] || `${nombre}, ¿sigues ahí? Estamos aquí para ayudarte con tu arrendamiento 😊`;
  return msg + `\n\nEscríbenos cuando puedas o llámanos al 📞 *812 919 1918*${CONTACTO}`;
}

// ── PALABRAS CLAVE ────────────────────────────────────────────────────────────
function limpiar(txt) {
  return txt.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
function detectar(txt, mapa) {
  const tl = limpiar(txt);
  for (const [clave, num] of Object.entries(mapa)) {
    if (tl.includes(limpiar(clave))) return String(num);
  }
  return null;
}
const PALABRAS = {
  INICIO: {
    'arrendador':1,'propietario':1,'dueno':1,'dueño':1,'propietaria':1,'duena':1,'dueña':1,
    'arrendatario':2,'inquilino':2,'inquilina':2,'arrendataria':2,'rento':2,
    'asesor':3,'asesora':3,'agente':3,'corredor':3,'inmobiliaria':3,'remax':3,
  },
  INT: {
    'poliza':1,'póliza':1,'investigacion':2,'investigación':2,'investigaciones':2,
    'seguro':3,'seguros':3,'contrato':4,'ratificacion':5,'ratificación':5,'notaria':5,'notaría':5,
    'administracion':6,'administración':6,'administrar':6,'estatus':7,'estado poliza':7,'folio':7,
    'hablar':8,'agente':8,'asesor':8,
  },
  INT_ASESOR: {
    'alta':1,'registro':1,'darme':1,'poliza':2,'póliza':2,'investigacion':3,'investigación':3,
    'investigaciones':3,'seguro':4,'seguros':4,'contrato':5,'ratificacion':6,'ratificación':6,
    'notaria':6,'administracion':7,'administración':7,'hablar':8,'agente':8,
  },
  TIPO: {
    'casa':1,'residencia':1,'hogar':1,'departamento':2,'depto':2,'apartamento':2,
    'local':3,'comercial':3,'tienda':3,'oficina':4,'bodega':5,'nave':5,'industrial':5,'otro':6,
  },
  SEGUROS: {
    'responsabilidad':1,'rc':1,'civil':1,'danos':1,'daños':1,'inmueble':2,
    'comercial':3,'industrial':3,'personalizado':4,'otro':4,'especial':4,
  },
  CONTRATO_TIPO: { 'habitacional':1,'vivienda':1,'comercial':2,'industrial':3,'otro':4 },
  CONTRATO_FIRMA: {
    'digital':1,'electronica':1,'electrónica':1,'presencial':2,'fisica':2,'física':2,'oficina':2,
    'notaria':3,'notaría':3,'ratificacion':3,'ratificación':3,
  },
  INVESTIGACIONES: { 'uno':1,'una':1,'dos':2,'tres':3,'personalizado':4,'otro':4 },
};

function normalizar(raw, paso) {
  const t = raw.trim();
  if (/^\d+$/.test(t)) return t;
  const mapa = PALABRAS[paso] || null;
  if (mapa) { const found = detectar(t, mapa); if (found) return found; }
  return t;
}

// ── SESIONES ──────────────────────────────────────────────────────────────────
const sesiones = new Map();
const timers   = new Map();
const followupTimers = new Map();
const TIMEOUT_MS   = 60 * 60 * 1000; // 1 hora → Incompleto
const FOLLOWUP_MS  = 30 * 60 * 1000; // 30 min → mensaje recordatorio

function getSesion(tel) {
  if (!sesiones.has(tel)) {
    sesiones.set(tel, { telefono: tel, paso: 'INICIO', tipo_usuario: null, nombre: null, inmobiliaria: null, intencion: null, r: {} });
  }
  return sesiones.get(tel);
}

function cancelarTimers(tel) {
  if (timers.has(tel)) { clearTimeout(timers.get(tel)); timers.delete(tel); }
  if (followupTimers.has(tel)) { clearTimeout(followupTimers.get(tel)); followupTimers.delete(tel); }
}

function iniciarTimers(s, clientRef) {
  cancelarTimers(s.telefono);

  // Seguimiento a los 30 min si hay algo que decir
  if (s.paso !== 'INICIO') {
    followupTimers.set(s.telefono, setTimeout(async () => {
      if (sesiones.has(s.telefono) && s.paso !== 'FINALIZADO') {
        try {
          const chat = await clientRef.getChatById(s.telefono);
          await chat.sendMessage(msgSeguimiento(s));
          console.log(`💬 Seguimiento enviado → ${s.telefono}`);
        } catch (e) {
          console.error('Error enviando seguimiento:', e.message);
        }
      }
    }, FOLLOWUP_MS));
  }

  // Incompleto a la 1 hora
  timers.set(s.telefono, setTimeout(() => {
    if (sesiones.has(s.telefono) && s.paso !== 'FINALIZADO') {
      console.log(`⏱️  Sesión inactiva 1h → Incompleto [${s.telefono}]`);
      crearOActualizarLead(s, 'Incompleto');
      sesiones.delete(s.telefono);
      cancelarTimers(s.telefono);
    }
  }, TIMEOUT_MS));
}

function notificar(s) {
  console.log(`\n🔔 LEAD COMPLETO → ${s.nombre} [${s.intencion}]\n`);
  cancelarTimers(s.telefono);
  crearOActualizarLead(s, 'Nuevo');
}

// ── FLUJO COMPARTIDO ──────────────────────────────────────────────────────────
function despuesDeZona(s) {
  const { intencion, r } = s;
  if (intencion === 'cotizar_poliza') { s.paso = 'FINALIZADO'; notificar(s); return msgPoliza(r.renta, r.tipo, r.zona); }
  if (intencion === 'cotizar_contrato') { s.paso = 'CON_TIPO'; return MENU_CONTRATO_TIPO; }
  if (intencion === 'cotizar_ratif') { s.paso = 'FINALIZADO'; notificar(s); return msgRatif(r.tipo, r.zona); }
  if (intencion === 'cotizar_seg_inmueble') { s.paso = 'FINALIZADO'; notificar(s); return msgSegInmueble(r.tipo, r.zona); }
  if (intencion === 'administracion') { s.paso = 'FINALIZADO'; notificar(s); return msgAdmin(r.tipo, r.zona); }
  s.paso = 'FINALIZADO'; notificar(s); return MENU_INICIO;
}

// ── MÁQUINA DE ESTADOS ────────────────────────────────────────────────────────
async function procesar(s, raw) {
  let pasoPalabras = s.paso;
  if (s.paso === 'C_INT') pasoPalabras = 'INT_ASESOR';
  else if (['A_INT','B_INT'].includes(s.paso)) pasoPalabras = 'INT';
  else if (['A_CT','B_CT','C_CT'].includes(s.paso)) pasoPalabras = 'TIPO';
  else if (s.paso === 'SEG_MENU') pasoPalabras = 'SEGUROS';
  else if (s.paso === 'CON_TIPO') pasoPalabras = 'CONTRATO_TIPO';
  else if (s.paso === 'CON_FIRMA') pasoPalabras = 'CONTRATO_FIRMA';
  else if (['A_INV','B_INV','C_INV'].includes(s.paso)) pasoPalabras = 'INVESTIGACIONES';

  const t = normalizar(raw, pasoPalabras);
  const p = s.paso;

  if (p === 'INICIO') {
    if (t==='1') { s.tipo_usuario='arrendador';  s.paso='A_NOM'; return '¿Cuál es tu nombre completo?'; }
    if (t==='2') { s.tipo_usuario='arrendatario'; s.paso='B_NOM'; return '¿Cuál es tu nombre completo?'; }
    if (t==='3') { s.tipo_usuario='asesor';       s.paso='C_NOM'; return '¡Hola, colega! ¿Cuál es tu nombre completo?'; }
    return MENU_INICIO;
  }

  if (p === 'A_NOM') { s.nombre=t; s.paso='A_TEL'; crearOActualizarLead(s,'Iniciado'); return `Gracias *${t}* 😊\n\n¿Cuál es tu número de teléfono de contacto? (ej: 8121234567)`; }
  if (p === 'B_NOM') { s.nombre=t; s.paso='B_TEL'; crearOActualizarLead(s,'Iniciado'); return `Gracias *${t}* 😊\n\n¿Cuál es tu número de teléfono de contacto? (ej: 8121234567)`; }
  if (p === 'C_NOM') { s.nombre=t; s.paso='C_TEL'; crearOActualizarLead(s,'Iniciado'); return `¡Hola *${t}*! 👋\n\n¿Cuál es tu número de teléfono de contacto? (ej: 8121234567)`; }

  if (p === 'A_TEL') { s.r.telefono_contacto=t; s.paso='A_INT'; return MENU_INTENCION(s.nombre, false); }
  if (p === 'B_TEL') { s.r.telefono_contacto=t; s.paso='B_INT'; return MENU_INTENCION(s.nombre, false); }
  if (p === 'C_TEL') { s.r.telefono_contacto=t; s.paso='C_INM'; return '¿Con qué inmobiliaria trabajas? (o escribe "independiente")'; }
  if (p === 'C_INM') { s.inmobiliaria=t; s.paso='C_INT'; return MENU_INTENCION(s.nombre, true); }

  if (p === 'A_INT' || p === 'B_INT') {
    const px = p[0];
    if (t==='1') { s.intencion='cotizar_poliza';   s.paso=`${px}_CR`; return '¿Cuál es la renta mensual del inmueble? (ej: 15000)'; }
    if (t==='2') { s.intencion='cotizar_invest';   s.paso=`${px}_INV`; return MENU_INVESTIGACIONES; }
    if (t==='3') { s.intencion='cotizar_seguros';  s.paso='SEG_MENU'; return MENU_SEGUROS; }
    if (t==='4') { s.intencion='cotizar_contrato'; s.paso=`${px}_CR`; return '¿Cuál es la renta mensual del inmueble? (ej: 15000)'; }
    if (t==='5') { s.intencion='cotizar_ratif';    s.paso=`${px}_CR`; return '¿Cuál es la renta mensual del inmueble? (ej: 15000)'; }
    if (t==='6') { s.intencion='administracion';   s.paso=`${px}_CR`; return '¿Cuál es la renta mensual del inmueble? (ej: 15000)'; }
    if (t==='7') { s.intencion='estatus'; s.paso=`${px}_EF`; return 'Comparte tu folio de póliza (formato PJM-00...)'; }
    if (t==='8') { s.intencion='hablar_agente'; s.paso='FINALIZADO'; notificar(s); return msgAgente(s.nombre); }
    return MENU_INTENCION(s.nombre, false);
  }

  if (p === 'C_INT') {
    if (t==='1') { s.intencion='alta_agente'; s.paso='FINALIZADO'; notificar(s); return `Tu solicitud de alta fue registrada ✅\n\n• Nombre: ${s.nombre}\n• Inmobiliaria: ${s.inmobiliaria}\n\nEn breve un asesor PJM te contactará.${CONTACTO}`; }
    if (t==='2') { s.intencion='cotizar_poliza';   s.paso='C_CR'; return '¿Cuál es la renta mensual del inmueble del cliente? (ej: 15000)'; }
    if (t==='3') { s.intencion='cotizar_invest';   s.paso='C_INV'; return MENU_INVESTIGACIONES; }
    if (t==='4') { s.intencion='cotizar_seguros';  s.paso='SEG_MENU'; return MENU_SEGUROS; }
    if (t==='5') { s.intencion='cotizar_contrato'; s.paso='C_CR'; return '¿Cuál es la renta mensual del inmueble del cliente? (ej: 15000)'; }
    if (t==='6') { s.intencion='cotizar_ratif';    s.paso='C_CR'; return '¿Cuál es la renta mensual del inmueble del cliente? (ej: 15000)'; }
    if (t==='7') { s.intencion='administracion';   s.paso='C_CR'; return '¿Cuál es la renta mensual del inmueble? (ej: 15000)'; }
    if (t==='8') { s.intencion='estatus'; s.paso='C_EF'; return 'Comparte el folio de póliza del cliente (formato PJM-00...)'; }
    if (t==='9') { s.intencion='hablar_agente'; s.paso='FINALIZADO'; notificar(s); return msgAgente(s.nombre); }
    return MENU_INTENCION(s.nombre, true);
  }

  if (p === 'A_CR' || p === 'B_CR' || p === 'C_CR') { s.r.renta = t; s.paso = p.replace('_CR','_CT'); return MENU_TIPO; }

  if (p === 'A_CT' || p === 'B_CT' || p === 'C_CT') {
    if (t === '6') { s.r.tipo = 'Otro'; s.paso = p.replace('_CT','_CTO'); return 'Escribe el tipo de inmueble:'; }
    if (TIPOS_INMUEBLE[t]) { s.r.tipo = TIPOS_INMUEBLE[t]; s.paso = p.replace('_CT','_CZ'); return MENU_ZONA; }
    s.r.tipo = raw.trim(); s.paso = p.replace('_CT','_CZ'); return MENU_ZONA;
  }
  if (p === 'A_CTO' || p === 'B_CTO' || p === 'C_CTO') { s.r.tipo = t; s.paso = p.replace('_CTO','_CZ'); return MENU_ZONA; }
  if (p === 'A_CZ' || p === 'B_CZ' || p === 'C_CZ') { s.r.zona = t; return despuesDeZona(s); }

  if (p === 'CON_TIPO') {
    if (TIPOS_CONTRATO[t]) { s.r.tipoC = TIPOS_CONTRATO[t]; s.paso = 'CON_FIRMA'; return MENU_CONTRATO_FIRMA; }
    if (t === '4') { s.paso = 'CON_TIPO_OTRO'; return 'Escribe el tipo de contrato:'; }
    return MENU_CONTRATO_TIPO;
  }
  if (p === 'CON_TIPO_OTRO') { s.r.tipoC = t; s.paso = 'CON_FIRMA'; return MENU_CONTRATO_FIRMA; }

  if (p === 'CON_FIRMA') {
    if (t === '1') { s.r.firma = 'Firma Digital'; }
    else if (t === '2') { s.r.firma = 'Firma Presencial'; }
    else if (t === '3') { s.r.firma = 'Ratificación ante Notaría'; s.paso = 'FINALIZADO'; notificar(s); return msgRatifContrato(s.r.tipo, s.r.zona, s.r.tipoC); }
    else return MENU_CONTRATO_FIRMA;
    s.paso = 'FINALIZADO'; notificar(s); return msgContrato(s.r.renta, s.r.tipo, s.r.zona, s.r.tipoC, s.r.firma);
  }

  if (p === 'SEG_MENU') {
    if (t==='1') { s.r.seguro='Responsabilidad Civil'; s.paso='FINALIZADO'; notificar(s); return `🛡️ *Responsabilidad Civil por Daños a Terceros*\n\nCubre fugas, incendios, daños estructurales y afectaciones a vecinos.\n\nUn agente te contactará para cotizarte. 🤝${CONTACTO}`; }
    if (t==='2') { s.intencion='cotizar_seg_inmueble'; s.r.seguro='Seguro para Inmuebles'; const px = s.tipo_usuario==='asesor'?'C':(s.tipo_usuario==='arrendador'?'A':'B'); s.paso = `${px}_CR`; return '¿Cuál es la renta mensual del inmueble? (ej: 15000)'; }
    if (t==='3') { s.r.seguro='Comercial/Industrial'; s.paso='FINALIZADO'; notificar(s); return `🏢 *Seguros Comerciales e Industriales*\n\nPara locales, oficinas, bodegas y naves.\n\nUn agente te contactará para cotizarte. 🤝${CONTACTO}`; }
    if (t==='4') { s.paso='SEG_PERS'; return 'Describe el inmueble y las coberturas que necesitas:'; }
    return MENU_SEGUROS;
  }
  if (p === 'SEG_PERS') { s.r.seguro=`Personalizado: ${t}`; s.paso='FINALIZADO'; notificar(s); return `Gracias por los detalles.\n\nUn agente diseñará una cobertura a tu medida y te contactará. ⚙️${CONTACTO}`; }

  if (p === 'A_INV' || p === 'B_INV' || p === 'C_INV') {
    if (PRECIOS_INVEST[t]) { s.r.investigaciones=PRECIOS_INVEST[t]; s.paso='FINALIZADO'; notificar(s); return `✅ *${PRECIOS_INVEST[t]}*\n\nUn agente te contactará para continuar. 📋${CONTACTO}`; }
    if (t==='4') { s.paso=p+'C'; return '¿Cuántas investigaciones necesitas? (escribe el número)'; }
    if (/^\d+$/.test(t) && parseInt(t) > 3) { s.r.investigaciones=`${t} investigaciones (personalizado)`; s.paso='FINALIZADO'; notificar(s); return `Necesitas *${t} investigaciones*.\n\nUn agente te cotizará el paquete personalizado. 📋${CONTACTO}`; }
    return MENU_INVESTIGACIONES;
  }
  if (p === 'A_INVC' || p === 'B_INVC' || p === 'C_INVC') {
    s.r.investigaciones=`${t} investigaciones (personalizado)`; s.paso='FINALIZADO'; notificar(s);
    return `Necesitas *${t} investigaciones*.\n\nUn agente te cotizará el paquete. 📋${CONTACTO}`;
  }

  if (p === 'A_EF' || p === 'B_EF' || p === 'C_EF') { s.r.folio_poliza=t; s.paso=p+'2'; return 'Y el folio de arrendamiento (formato CAR-00...)'; }
  if (p === 'A_EF2' || p === 'B_EF2' || p === 'C_EF2') {
    s.r.folio_arrendamiento=t; s.paso='FINALIZADO'; notificar(s);
    return `Gracias *${s.nombre}* ✅\n\nFolio póliza: ${s.r.folio_poliza}\nFolio arrendamiento: ${t}\n\nEn breve te contactará tu agente.${CONTACTO}`;
  }

  if (p === 'FINALIZADO') { sesiones.delete(s.telefono); return MENU_INICIO; }
  return MENU_INICIO;
}

// ── CLIENTE WHATSAPP ──────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('\n📱 Escanea este QR con WhatsApp:\n');
  qrcode.generate(qr, { small: true });
  console.log('\nWhatsApp → Dispositivos vinculados → Vincular dispositivo\n');
});

client.on('ready', () => {
  console.log('✅ Bot PJM activo\n');
  const { iniciarCronRecordatorios } = require('./crm/recordatorios');
  iniciarCronRecordatorios(client);
});

client.on('message', async (msg) => {
  if (msg.fromMe) return;
  if (msg.from.includes('status@broadcast')) return;
  const tel   = msg.from;
  const texto = (msg.body || '').trim();
  if (!texto) return;
  console.log(`📩 [${tel}] "${texto}"`);

  // Registrar desde el primer mensaje
  registrarPrimerMensaje(tel);

  const s = getSesion(tel);
  try {
    const resp = await procesar(s, texto);
    if (resp) {
      await msg.reply(resp);
      console.log(`✉️  → ${s.paso}`);
    }
    if (s.paso !== 'FINALIZADO') iniciarTimers(s, client);
    else sesiones.delete(tel);
  } catch (err) {
    console.error('❌ Error:', err);
    await msg.reply('Ocurrió un error. Escríbenos al 812 919 1918.');
  }
});

client.on('disconnected', (r) => console.log('❌ Desconectado:', r));
console.log('🚀 Iniciando Bot PJM...');
client.initialize();
