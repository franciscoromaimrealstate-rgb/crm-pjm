const bcrypt = require('./node_modules/bcryptjs');
const db = require('./crm/db');

// Limpiar datos previos (excepto admin)
['lead_notas','leads','expedientes','solicitudes','incumplimientos','quejas','casos_juridicos','guardias'].forEach(t => db.prepare(`DELETE FROM ${t}`).run());
db.prepare("DELETE FROM usuarios WHERE rol != 'admin'").run();
db.prepare("DELETE FROM sqlite_sequence WHERE name != 'usuarios'").run();

const pass = bcrypt.hashSync('PJM@admin2024', 10);
const now = new Date();
const daysAgo = d => { const dt = new Date(now); dt.setDate(dt.getDate()-d); return dt.toISOString().slice(0,19).replace('T',' '); };
const dateAgo = d => daysAgo(d).slice(0,10);

// ── ASESORES ──
const asesores = [
  ['Laura Méndez','laura@pjm.com','PJM-A-001','Inmobiliaria Cumbre'],
  ['Carlos Reyes','carlos@pjm.com','PJM-A-002','Grupo Bíos'],
  ['Sofía Torres','sofia@pjm.com','PJM-A-003','Independiente'],
];
const aIds = asesores.map(([n,e,f,i]) =>
  db.prepare("INSERT INTO usuarios (nombre,email,password_hash,rol,folio,inmobiliaria,activo) VALUES (?,?,?,'asesor',?,?,1)")
    .run(n,e,pass,f,i).lastInsertRowid
);
const aN = asesores.map(a=>a[0]);

// ── LEADS (30 — más variedad de fechas para ver tendencias) ──
const leadData = [
  ['Ana García','arrendatario','whatsapp','cotizar_poliza','Zapopan','Ganado',0],
  ['Roberto López','arrendador','llamada','cotizar_invest','Guadalajara Centro','Ganado',1],
  ['María Hernández','arrendatario','directo','cotizar_poliza','Norte','En Proceso',0],
  ['Juan Martínez','arrendador','whatsapp','administracion','Sur','Nuevo',1],
  ['Patricia Sánchez','arrendatario','referido','cotizar_contrato','Centro','Perdido',3],
  ['Luis González','arrendador','whatsapp','cotizar_poliza','Tlaquepaque','Ganado',2],
  ['Carmen Díaz','arrendatario','manual','cotizar_invest','Zapopan','En Proceso',0],
  ['Miguel Ramírez','arrendador','llamada','cotizar_ratif','Norte','Nuevo',5],
  ['Fernanda Torres','arrendatario','whatsapp','cotizar_poliza','Sur','Ganado',30],
  ['Alejandro Morales','arrendador','directo','administracion','Centro','Perdido',25],
  ['Isabel Ruiz','arrendatario','whatsapp','cotizar_poliza','Zapopan','Ganado',28],
  ['David Jiménez','arrendador','llamada','cotizar_invest','Norte','En Proceso',15],
  ['Valeria Castro','arrendatario','referido','cotizar_contrato','Tlaquepaque','Nuevo',12],
  ['Eduardo Flores','arrendador','whatsapp','cotizar_poliza','Centro','Incompleto',10],
  ['Daniela Vargas','arrendatario','directo','cotizar_ratif','Sur','En Proceso',8],
  ['Sergio Mendoza','arrendador','manual','administracion','Zapopan','Perdido',55],
  ['Claudia Reyes','arrendatario','whatsapp','cotizar_poliza','Norte','Ganado',50],
  ['Fernando Peña','arrendador','llamada','cotizar_invest','Centro','Ganado',45],
  ['Adriana Cruz','arrendatario','whatsapp','cotizar_contrato','Tlaquepaque','En Proceso',3],
  ['Andrés Vega','arrendador','referido','cotizar_poliza','Zapopan','Nuevo',1],
  ['Renata Ochoa','arrendatario','whatsapp','cotizar_poliza','Guadalajara Centro','Ganado',60],
  ['Emilio Ramos','arrendador','directo','administracion','Sur','Perdido',40],
  ['Lorena Castillo','arrendatario','whatsapp','cotizar_poliza','Norte','En Proceso',2],
  ['Hector Fuentes','arrendador','llamada','cotizar_invest','Centro','Nuevo',0],
  ['Natalia Perez','arrendatario','referido','cotizar_ratif','Tlaquepaque','Ganado',90],
  ['Ricardo Salinas','arrendador','whatsapp','cotizar_poliza','Zapopan','En Proceso',4],
  ['Monica Ibarra','arrendatario','directo','cotizar_contrato','Norte','Incompleto',7],
  ['Javier Nava','arrendador','manual','administracion','Sur','Perdido',20],
  ['Esperanza Ríos','arrendatario','whatsapp','cotizar_poliza','Centro','Ganado',35],
  ['Gabriel Lara','arrendador','llamada','cotizar_invest','Guadalajara Centro','Nuevo',2],
];
let lidN = 1;
const proxSeg = i => {
  if (['Ganado','Perdido'].includes(leadData[i][5])) return '';
  const d = [-1,1,2,3,4,-2,0,5,1,3][i%10]; // neg = futuro
  return dateAgo(-d);
};
leadData.forEach(([nombre,tipo,fuente,intencion,zona,estado,diasAtras], i) => {
  const ai = i%3;
  const lid = `PJM-L-${String(lidN++).padStart(3,'0')}`;
  const r = db.prepare(`INSERT INTO leads (lid,nombre,tipo_usuario,telefono_wa,fuente,intencion,zona,estado,asesor_id,asesor_nombre,prox_seguimiento,fecha,updated_at,motivo_perdida)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(lid, nombre, tipo, `5213310${String(100000+i).slice(1)}`, fuente, intencion, zona, estado,
      aIds[ai], aN[ai], proxSeg(i), daysAgo(diasAtras+1), daysAgo(diasAtras),
      estado==='Perdido' ? ['precio','no_responde','eligio_otro','desistio'][i%4] : '');
  const notasTextos = [
    'Primer contacto. Interesado en póliza para casa.',
    'Llamó para consultar requisitos de investigación.',
    'Se envió cotización por correo. Espera aprobación del arrendador.',
    'Cliente confirma interés. Agenda cita para firma.',
    'Revisó documentos. Solicita ajuste en condiciones.',
  ];
  notasTextos.slice(0,(i%3)+1).forEach((texto,j) =>
    db.prepare('INSERT INTO lead_notas (lead_id,texto,usuario_nombre,fecha) VALUES (?,?,?,?)')
      .run(r.lastInsertRowid, texto, aN[ai], daysAgo(diasAtras+j))
  );
  if (!['Ganado','Perdido'].includes(estado) && proxSeg(i)) {
    db.prepare('INSERT INTO lead_notas (lead_id,texto,usuario_nombre,fecha) VALUES (?,?,?,?)')
      .run(r.lastInsertRowid, `📅 Seguimiento programado para: ${proxSeg(i)}`, aN[ai], daysAgo(diasAtras));
  }
});

// ── EXPEDIENTES (12 — con datos financieros reales) ──
const expData = [
  ['Ana García','Arrendador Morales','Casa','Calle Hidalgo 123, Guadalajara','$9,500','2025-01-15','2026-01-15','Activo','poliza','nueva','2025-01-15',14,0,8,'$9,500','12%','$1,140'],
  ['Roberto López','Arrendador Vega','Departamento','Av. Patria 456, Zapopan','$12,000','2025-02-01','2026-02-01','Activo','poliza','renovacion','2025-02-01',10,0,6,'$12,000','12%','$1,440'],
  ['Luis González','Arrendador Cruz','Local Comercial','Av. Vallarta 987, Guadalajara','$22,000','2025-04-01','2026-04-01','Activo','poliza','nueva','2025-04-01',7,0,6,'$22,000','10%','$2,200'],
  ['Fernanda Torres','Arrendador Peña','Casa','Calle Morelos 89, Tlaquepaque','$8,500','2025-01-20','2026-01-20','Activo','contrato_simple','nueva','2025-01-20',5,1,3,'$8,500','8%','$680'],
  ['Isabel Ruiz','Arrendador Ortiz','Departamento','Blvd. Puerta de Hierro 200, Zapopan','$15,000','2024-12-01','2025-12-01','Activo','poliza','renovacion','2024-12-01',12,0,6,'$15,000','12%','$1,800'],
  ['Claudia Reyes','Arrendador García','Oficina','Av. México 345, Guadalajara','$18,000','2024-11-01','2025-11-01','Activo','poliza','nueva','2024-11-01',8,0,6,'$18,000','10%','$1,800'],
  ['Fernando Peña','Arrendador López','Casa','Calle Independencia 147, Guadalajara','$11,000','2025-03-10','2026-03-10','Activo','poliza','nueva','2025-03-10',9,0,6,'$11,000','12%','$1,320'],
  ['Renata Ochoa','Arrendador Hernández','Departamento','Av. Niños Héroes 258, Guadalajara','$13,500','2024-10-01','2025-10-01','Activo','poliza','renovacion','2024-10-01',6,0,6,'$13,500','12%','$1,620'],
  ['Natalia Perez','Arrendador Ramírez','Casa','Calle Reforma 567, Zapopan','$9,000','2024-09-15','2025-09-15','Activo','contrato_simple','nueva','2024-09-15',4,1,3,'$9,000','8%','$720'],
  ['Esperanza Ríos','Arrendador Torres','Departamento','Av. López Mateos 890, Guadalajara','$14,000','2024-08-01','2025-08-01','Activo','poliza','renovacion','2024-08-01',11,0,6,'$14,000','12%','$1,680'],
  ['María Hernández','Arrendador Díaz','Casa','Av. Americas 321, Zapopan','$10,500','2025-05-01','2026-05-01','En Proceso','poliza','nueva','2025-05-01',0,0,0,'','',''],
  ['Juan Martínez','Arrendador Flores','Local Comercial','Blvd. Tlaquepaque 654, Tlaquepaque','$25,000','2025-06-01','2026-06-01','Cancelado','poliza','nueva','2025-06-01',0,0,0,'$25,000','10%','$0'],
];

let expN = 1;
expData.forEach(([arr,arrend,tipoInm,dir,renta,inicio,fin,estatus,tipoContrato,tipoContr2,fechaExp,dias,aval,mesesPol,ingreso,comPct,comMonto], i) => {
  const ai = i%3;
  const folio = `PJM-26-${String(i+1).padStart(2,'0')}-E${String(expN).padStart(3,'0')}`;
  const folPol = `PJM-26-${String(i+1).padStart(2,'0')}-P${String(expN).padStart(3,'0')}`;
  expN++;
  db.prepare(`INSERT INTO expedientes (folio,folio_poliza,nombre_arrendatario,nombre_arrendador,direccion_inmueble,tipo_inmueble,monto_renta,inicio_arrendamiento,fin_arrendamiento,estatus_general,tipo_contratacion,asesor_id,asesor_nombre,ingreso_total,comision_porcentaje,comision_monto,pago_confirmado,fecha,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(folio, folPol, arr, arrend, dir, tipoInm, renta, inicio, fin,
      estatus, tipoContrato, aIds[ai], aN[ai],
      ingreso, comPct, comMonto,
      estatus==='Activo' ? 1 : 0,
      fechaExp, daysAgo(i*5));
});

// ── SOLICITUDES ──
const solData = [
  ['investigacion','Investigación Ana García','resuelta'],
  ['cotizacion','Cotización Póliza Casa Zapopan','en_proceso'],
  ['tramite','Trámite Contrato Roberto López','pendiente'],
  ['consulta','Consulta estatus expediente E003','resuelta'],
  ['investigacion','Investigación Luis González Local','en_proceso'],
];
solData.forEach(([tipo,nombre,estado],i) => {
  db.prepare("INSERT INTO solicitudes (folio,tipo,nombre,estado,fecha) VALUES (?,?,?,?,?)")
    .run(`PJM-SOL-${String(i+1).padStart(3,'0')}`, tipo, nombre, estado, daysAgo(i*4));
});

// ── INCUMPLIMIENTOS ──
[
  ['Ana García','falta_pago','notificado','en_gestion','2026-04-10',''],
  ['Roberto López','daños_inmueble','en_gestion','','2026-03-01',''],
  ['Fernanda Torres','uso_indebido','resuelto','a_favor_arrendador','2025-11-01','2026-02-15'],
].forEach(([nombre,tipo,estatus,resultado,fechaIn,fechaRes],i) => {
  db.prepare("INSERT INTO incumplimientos (nombre_arrendatario,tipo,estatus,resultado,asesor_id,asesor_nombre,fecha_inicio,fecha_resolucion,notas) VALUES (?,?,?,?,?,?,?,?,?)")
    .run(nombre, tipo, estatus, resultado, aIds[i%3], aN[i%3], fechaIn, fechaRes, 'Caso registrado por incumplimiento de contrato.');
});

// ── QUEJAS ──
[
  [aIds[0],aN[0],'mal_servicio','abierta','2026-06-01',''],
  [aIds[1],aN[1],'demora_investigacion','en_proceso','2026-05-15',''],
  [aIds[2],aN[2],'error_contrato','resuelta','2026-04-01','2026-05-10'],
].forEach(([aid,an,tipo,estatus,apertura,resolucion],i) => {
  db.prepare("INSERT INTO quejas (asesor_id,asesor_nombre,tipo,estatus,descripcion,fecha,fecha_apertura,fecha_resolucion) VALUES (?,?,?,?,?,?,?,?)")
    .run(aid, an, tipo, estatus, 'Queja registrada sobre el proceso de arrendamiento.', apertura, apertura, resolucion);
});

// ── JURÍDICO ──
[
  ['Ana García','demanda','activo','','45000','0',aIds[0],aN[0],'2026-01-15',''],
  ['Fernanda Torres','cobro_judicial','resuelto','favorable','28000','25000',aIds[1],aN[1],'2025-09-01','2026-03-15'],
].forEach(([nombre,tipo,estatus,sentencia,reclamado,recuperado,aid,an,fechaIn,fechaRes],i) => {
  db.prepare("INSERT INTO casos_juridicos (nombre_arrendatario,tipo,estatus,sentencia,monto_reclamado,monto_recuperado,asesor_id,asesor_nombre,fecha_inicio,fecha_resolucion,notas) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(nombre, tipo, estatus, sentencia, reclamado, recuperado, aid, an, fechaIn, fechaRes, 'Caso enviado a despacho jurídico externo.');
});

// ── GUARDIAS ──
['Turno mañana','Turno tarde','Turno noche'].forEach((turno,i) =>
  db.prepare("INSERT INTO guardias (turno,asesor_id,asesor_nombre,fecha) VALUES (?,?,?,?)")
    .run(turno, aIds[i%3], aN[i%3], daysAgo(i))
);

console.log('✅ Seed completado');
['leads','expedientes','solicitudes','incumplimientos','quejas','casos_juridicos','usuarios'].forEach(t =>
  console.log(` ${t}: ${db.prepare('SELECT COUNT(*) as c FROM '+t).get().c} registros`)
);
