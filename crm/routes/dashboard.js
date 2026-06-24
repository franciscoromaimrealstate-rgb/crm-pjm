const express = require('express');
const db = require('../db');
const { middleware } = require('../auth');

const r = express.Router();
r.use(middleware);

r.get('/', (req, res) => {
  const isAdmin = req.user.rol === 'admin';
  const uid = req.user.id;
  const fL = isAdmin ? '' : `AND asesor_id = ${uid}`;
  const fE = isAdmin ? '' : `AND asesor_id = ${uid}`;

  // ── LEADS ──
  const totales = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN estado='Nuevo' THEN 1 ELSE 0 END) as nuevos,
    SUM(CASE WHEN estado='En Proceso' THEN 1 ELSE 0 END) as en_proceso,
    SUM(CASE WHEN estado='Ganado' THEN 1 ELSE 0 END) as ganados,
    SUM(CASE WHEN estado='Perdido' THEN 1 ELSE 0 END) as perdidos,
    SUM(CASE WHEN estado='Incompleto' THEN 1 ELSE 0 END) as incompletos,
    SUM(CASE WHEN fuente='whatsapp' THEN 1 ELSE 0 END) as de_whatsapp,
    SUM(CASE WHEN fuente='manual' THEN 1 ELSE 0 END) as manuales,
    SUM(CASE WHEN fuente='llamada' THEN 1 ELSE 0 END) as de_llamada
    FROM leads WHERE 1=1 ${fL}`).get();

  const hoy = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE DATE(fecha)=DATE('now','localtime') ${fL}`).get();
  const semana = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE fecha>=DATE('now','-7 days','localtime') ${fL}`).get();
  const mes = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE strftime('%Y-%m',fecha)=strftime('%Y-%m','now','localtime') ${fL}`).get();
  const mesPasado = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE strftime('%Y-%m',fecha)=strftime('%Y-%m',DATE('now','-1 month'),'localtime') ${fL}`).get();
  const pct_cierre = totales.total > 0 ? ((totales.ganados/totales.total)*100).toFixed(1) : '0.0';
  const pct_perdida = totales.total > 0 ? ((totales.perdidos/totales.total)*100).toFixed(1) : '0.0';

  const leadsPorMes = db.prepare(`SELECT strftime('%Y-%m',fecha) as mes, COUNT(*) as c
    FROM leads WHERE 1=1 ${fL} AND fecha>=DATE('now','-24 months')
    GROUP BY mes ORDER BY mes ASC`).all();

  const leadsSinSeguimiento = db.prepare(`SELECT id,lid,nombre,asesor_nombre,estado,fecha,prox_seguimiento
    FROM leads WHERE estado NOT IN ('Ganado','Perdido')
    AND (prox_seguimiento IS NULL OR prox_seguimiento='' OR prox_seguimiento < DATE('now'))
    AND fecha < DATE('now','-3 days') ${fL}
    ORDER BY fecha ASC LIMIT 20`).all();

  // ── EXPEDIENTES / FINANCIERO ──
  const expTotales = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN estatus_general='Activo' THEN 1 ELSE 0 END) as activos,
    SUM(CASE WHEN estatus_general='En Proceso' THEN 1 ELSE 0 END) as en_proceso,
    SUM(CASE WHEN estatus_general IN ('Nuevo','Investigación','Aprobado','Firma') THEN 1 ELSE 0 END) as en_curso,
    SUM(CASE WHEN estatus_general='Cancelado' THEN 1 ELSE 0 END) as cancelados,
    SUM(CASE WHEN tipo_contratacion='poliza' THEN 1 ELSE 0 END) as polizas,
    SUM(CASE WHEN tipo_contratacion='contrato_simple' THEN 1 ELSE 0 END) as contratos_simples,
    SUM(CAST(REPLACE(REPLACE(COALESCE(ingreso_total,'0'),',',''),'$','') AS REAL)) as ingreso_total_sum,
    SUM(CAST(REPLACE(REPLACE(COALESCE(comision_monto,'0'),',',''),'$','') AS REAL)) as comision_total_sum,
    SUM(CAST(REPLACE(REPLACE(COALESCE(monto_renta,'0'),',',''),'$','') AS REAL)) as valor_cartera_sum,
    SUM(CASE WHEN pago_confirmado=0 AND estatus_general='Activo' THEN 1 ELSE 0 END) as sin_pago_confirmado,
    SUM(CASE WHEN prorroga_automatica=1 THEN 1 ELSE 0 END) as en_prorroga,
    SUM(CASE WHEN COALESCE(inconsistencias,'')!='' THEN 1 ELSE 0 END) as con_inconsistencias
    FROM expedientes WHERE 1=1 ${fE}`).get();

  const ingresosPorMes = db.prepare(`SELECT strftime('%Y-%m',updated_at) as mes,
    COUNT(*) as ops,
    SUM(CAST(REPLACE(REPLACE(COALESCE(ingreso_total,'0'),',',''),'$','') AS REAL)) as ingresos,
    SUM(CAST(REPLACE(REPLACE(COALESCE(comision_monto,'0'),',',''),'$','') AS REAL)) as comisiones
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${fE}
    AND updated_at>=DATE('now','-24 months')
    GROUP BY mes ORDER BY mes ASC`).all();

  const cierresPorMes = db.prepare(`SELECT strftime('%Y-%m',updated_at) as mes, COUNT(*) as c
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${fE}
    AND updated_at>=DATE('now','-24 months')
    GROUP BY mes ORDER BY mes ASC`).all();

  const cierresMesActual = db.prepare(`SELECT COUNT(*) as c FROM expedientes
    WHERE estatus_general IN ('Activo','Firma') ${fE}
    AND strftime('%Y-%m',updated_at)=strftime('%Y-%m','now','localtime')`).get();
  const cierresMesPasado = db.prepare(`SELECT COUNT(*) as c FROM expedientes
    WHERE estatus_general IN ('Activo','Firma') ${fE}
    AND strftime('%Y-%m',updated_at)=strftime('%Y-%m',DATE('now','-1 month'),'localtime')`).get();

  const ingresosMesActual = db.prepare(`SELECT
    SUM(CAST(REPLACE(REPLACE(COALESCE(ingreso_total,'0'),',',''),'$','') AS REAL)) as tot
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${fE}
    AND strftime('%Y-%m',updated_at)=strftime('%Y-%m','now','localtime')`).get();
  const ingresosMesPasado = db.prepare(`SELECT
    SUM(CAST(REPLACE(REPLACE(COALESCE(ingreso_total,'0'),',',''),'$','') AS REAL)) as tot
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${fE}
    AND strftime('%Y-%m',updated_at)=strftime('%Y-%m',DATE('now','-1 month'),'localtime')`).get();

  const ticketPorTipo = db.prepare(`SELECT tipo_poliza,
    COUNT(*) as ops,
    AVG(CAST(REPLACE(REPLACE(COALESCE(ingreso_total,'0'),',',''),'$','') AS REAL)) as ticket_promedio
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') AND tipo_poliza!='' ${fE}
    GROUP BY tipo_poliza ORDER BY ticket_promedio DESC`).all();

  const tipoPorInmueble = db.prepare(`SELECT tipo_inmueble, COUNT(*) as c
    FROM expedientes WHERE tipo_inmueble!='' ${fE}
    GROUP BY tipo_inmueble ORDER BY c DESC LIMIT 6`).all();

  const zonasTop = db.prepare(`SELECT
    TRIM(SUBSTR(direccion_inmueble, INSTR(direccion_inmueble,',')+1)) as zona,
    COUNT(*) as c FROM expedientes WHERE direccion_inmueble LIKE '%,%' ${fE}
    GROUP BY zona ORDER BY c DESC LIMIT 5`).all();

  const ultimoCierre = db.prepare(`SELECT folio,nombre_arrendatario,direccion_inmueble,fin_arrendamiento,monto_renta,asesor_nombre,updated_at
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${fE}
    ORDER BY updated_at DESC LIMIT 1`).get();
  const mesMasCierres = db.prepare(`SELECT strftime('%Y-%m',updated_at) as mes, COUNT(*) as c
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${fE}
    GROUP BY mes ORDER BY c DESC LIMIT 1`).get();
  const tipoPropMasCerrado = db.prepare(`SELECT tipo_inmueble, COUNT(*) as c
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') AND tipo_inmueble!='' ${fE}
    GROUP BY tipo_inmueble ORDER BY c DESC LIMIT 1`).get();

  const tiempoPromCierre = db.prepare(`SELECT AVG(JULIANDAY(updated_at)-JULIANDAY(fecha)) as dias
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${fE}`).get();

  // ── CARTERA (vencimientos) ──
  const cartera90 = db.prepare(`SELECT folio,folio_poliza,nombre_arrendatario,nombre_arrendador,asesor_nombre,fin_arrendamiento,monto_renta,
    CAST(JULIANDAY(fin_arrendamiento)-JULIANDAY('now') AS INTEGER) as dias_restantes
    FROM expedientes WHERE estatus_general='Activo'
    AND fin_arrendamiento BETWEEN DATE('now') AND DATE('now','+90 days') ${fE}
    ORDER BY fin_arrendamiento ASC`).all();

  // ── ALERTAS ──
  const polizasPorVencer = db.prepare(`SELECT folio,folio_poliza,nombre_arrendatario,nombre_arrendador,asesor_nombre,fin_arrendamiento,
    CAST(JULIANDAY(fin_arrendamiento)-JULIANDAY('now') AS INTEGER) as dias_restantes
    FROM expedientes WHERE estatus_general='Activo'
    AND fin_arrendamiento BETWEEN DATE('now') AND DATE('now','+30 days') ${fE}
    ORDER BY fin_arrendamiento ASC`).all();

  const expEstancados = db.prepare(`SELECT id,folio,estatus_general,asesor_nombre,direccion_inmueble,
    CAST(JULIANDAY('now')-JULIANDAY(updated_at) AS INTEGER) as dias_sin_actividad
    FROM expedientes WHERE estatus_general NOT IN ('Activo','Cancelado')
    AND updated_at < DATE('now','-5 days') ${fE}
    ORDER BY dias_sin_actividad DESC LIMIT 10`).all();

  const sinDictamen = db.prepare(`SELECT id,folio,folio_opinion,asesor_nombre,fecha
    FROM expedientes WHERE (resultado_opinion IS NULL OR resultado_opinion='')
    AND folio_opinion!='' AND estatus_general NOT IN ('Cancelado') ${fE}
    LIMIT 10`).all();

  const formsSinLlenar = db.prepare(`SELECT id,folio,nombre_arrendatario,asesor_nombre,workflow_etapa,
    CAST(JULIANDAY('now')-JULIANDAY(updated_at) AS INTEGER) as dias
    FROM expedientes WHERE workflow_etapa IN ('arrendatario_enviado','arrendador_enviado')
    AND updated_at < DATE('now','-7 days') ${fE}
    ORDER BY dias DESC LIMIT 10`).all();

  // ── CANCELACIONES ──
  const cancelaciones = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN motivo_cancelacion='desistimiento' THEN 1 ELSE 0 END) as desistimientos,
    SUM(CASE WHEN motivo_cancelacion='incumplimiento' THEN 1 ELSE 0 END) as por_incumplimiento,
    SUM(CASE WHEN motivo_cancelacion='error_expediente' THEN 1 ELSE 0 END) as por_error,
    SUM(CASE WHEN motivo_cancelacion='otro' THEN 1 ELSE 0 END) as otros,
    SUM(CAST(REPLACE(REPLACE(COALESCE(cantidad_devuelta,'0'),',',''),'$','') AS REAL)) as monto_devuelto_sum,
    SUM(CAST(REPLACE(REPLACE(COALESCE(monto_retenido,'0'),',',''),'$','') AS REAL)) as monto_retenido_sum
    FROM expedientes WHERE estatus_general='Cancelado' ${fE}`).get();

  const polizasActivas = db.prepare(`SELECT COUNT(*) as c FROM expedientes WHERE tipo_contratacion='poliza' AND estatus_general='Activo' ${fE}`).get();
  const cancelacionesPorAsesor = isAdmin ? db.prepare(`SELECT asesor_nombre, COUNT(*) as c
    FROM expedientes WHERE estatus_general='Cancelado' AND asesor_nombre!=''
    GROUP BY asesor_nombre ORDER BY c DESC LIMIT 5`).all() : [];

  const ultimasCancelaciones = db.prepare(`SELECT folio,folio_poliza,nombre_arrendatario,asesor_nombre,motivo_cancelacion,cantidad_devuelta,monto_retenido,fecha_devolucion,updated_at
    FROM expedientes WHERE estatus_general='Cancelado' ${fE}
    ORDER BY updated_at DESC LIMIT 10`).all();

  // ── INCUMPLIMIENTOS ──
  const incumplimientosStats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN estatus='en_gestion' THEN 1 ELSE 0 END) as en_gestion,
    SUM(CASE WHEN estatus='notificado' THEN 1 ELSE 0 END) as notificados,
    SUM(CASE WHEN estatus='demanda_iniciada' THEN 1 ELSE 0 END) as en_demanda,
    SUM(CASE WHEN estatus='resuelto' THEN 1 ELSE 0 END) as resueltos,
    SUM(CASE WHEN resultado='a_favor_arrendador' AND estatus='resuelto' THEN 1 ELSE 0 END) as a_favor,
    SUM(CASE WHEN tipo='falta_pago' THEN 1 ELSE 0 END) as falta_pago,
    SUM(CASE WHEN tipo='daños_inmueble' THEN 1 ELSE 0 END) as daños,
    SUM(CASE WHEN tipo='abandono' THEN 1 ELSE 0 END) as abandono,
    SUM(CASE WHEN tipo='uso_indebido' THEN 1 ELSE 0 END) as uso_indebido
    FROM incumplimientos`).get();
  const tiempoPromResolucion = db.prepare(`SELECT AVG(JULIANDAY(fecha_resolucion)-JULIANDAY(fecha_inicio)) as dias
    FROM incumplimientos WHERE estatus='resuelto' AND fecha_inicio!='' AND fecha_resolucion!=''`).get();

  // ── QUEJAS ──
  const quejasStats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN estatus='abierta' THEN 1 ELSE 0 END) as abiertas,
    SUM(CASE WHEN estatus='en_proceso' THEN 1 ELSE 0 END) as en_proceso,
    SUM(CASE WHEN estatus='resuelta' THEN 1 ELSE 0 END) as resueltas,
    SUM(CASE WHEN tipo_reclamante='arrendador' THEN 1 ELSE 0 END) as de_arrendador,
    SUM(CASE WHEN tipo_reclamante='arrendatario' THEN 1 ELSE 0 END) as de_arrendatario,
    SUM(CASE WHEN tipo='mal_servicio' THEN 1 ELSE 0 END) as mal_servicio,
    SUM(CASE WHEN tipo='error_contrato' THEN 1 ELSE 0 END) as error_contrato,
    SUM(CASE WHEN tipo='demora_investigacion' THEN 1 ELSE 0 END) as demora_invest,
    SUM(CASE WHEN tipo='inconformidad_dictamen' THEN 1 ELSE 0 END) as inconformidad
    FROM quejas`).get();
  const tiempoPromQueja = db.prepare(`SELECT AVG(JULIANDAY(fecha_resolucion)-JULIANDAY(fecha_apertura)) as dias
    FROM quejas WHERE estatus='resuelta' AND fecha_apertura!='' AND fecha_resolucion!=''`).get();
  const quejasPorAsesor = isAdmin ? db.prepare(`SELECT asesor_nombre, COUNT(*) as total,
    SUM(CASE WHEN estatus='resuelta' THEN 1 ELSE 0 END) as resueltas
    FROM quejas WHERE asesor_nombre!='' GROUP BY asesor_id ORDER BY total DESC LIMIT 5`).all() : [];

  // ── JURÍDICO ──
  const juridicoStats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN estatus='activo' THEN 1 ELSE 0 END) as activos,
    SUM(CASE WHEN estatus='resuelto' THEN 1 ELSE 0 END) as resueltos,
    SUM(CASE WHEN sentencia='favorable' THEN 1 ELSE 0 END) as favorables,
    SUM(CASE WHEN sentencia='desfavorable' THEN 1 ELSE 0 END) as desfavorables,
    SUM(CAST(REPLACE(REPLACE(COALESCE(monto_reclamado,'0'),',',''),'$','') AS REAL)) as monto_reclamado_sum,
    SUM(CAST(REPLACE(REPLACE(COALESCE(monto_recuperado,'0'),',',''),'$','') AS REAL)) as monto_recuperado_sum,
    SUM(CASE WHEN tipo='demanda' THEN 1 ELSE 0 END) as demandas,
    SUM(CASE WHEN tipo='notificacion' THEN 1 ELSE 0 END) as notificaciones
    FROM casos_juridicos`).get();
  const juridicoMes = db.prepare(`SELECT COUNT(*) as c FROM casos_juridicos
    WHERE strftime('%Y-%m',fecha)=strftime('%Y-%m','now','localtime')`).get();
  const juridicoPasado = db.prepare(`SELECT COUNT(*) as c FROM casos_juridicos
    WHERE strftime('%Y-%m',fecha)=strftime('%Y-%m',DATE('now','-1 month'),'localtime')`).get();

  // ── CONTROL OPERATIVO ──
  const dictamenMes = db.prepare(`SELECT COUNT(*) as c FROM expedientes
    WHERE resultado_opinion!='' AND resultado_opinion IS NOT NULL ${fE}
    AND strftime('%Y-%m',updated_at)=strftime('%Y-%m','now','localtime')`).get();
  const dictamenPasado = db.prepare(`SELECT COUNT(*) as c FROM expedientes
    WHERE resultado_opinion!='' AND resultado_opinion IS NOT NULL ${fE}
    AND strftime('%Y-%m',updated_at)=strftime('%Y-%m',DATE('now','-1 month'),'localtime')`).get();
  const tiempoPromInvestigacion = db.prepare(`SELECT AVG(JULIANDAY(updated_at)-JULIANDAY(fecha)) as dias
    FROM expedientes WHERE resultado_opinion!='' AND folio_investigacion!='' ${fE}`).get();
  const arrendatariosNoCompletos = db.prepare(`SELECT COUNT(*) as c FROM expedientes
    WHERE workflow_etapa='arrendatario_enviado' ${fE}`).get();

  // ── RANKING ASESORES ──
  let rankingAsesores = [], top_asesores = [];
  if (isAdmin) {
    rankingAsesores = db.prepare(`SELECT asesor_id, asesor_nombre,
      COUNT(*) as operaciones,
      SUM(CASE WHEN estatus_general IN ('Activo','Firma') THEN 1 ELSE 0 END) as cierres,
      SUM(CAST(REPLACE(REPLACE(COALESCE(ingreso_total,'0'),',',''),'$','') AS REAL)) as ingresos,
      SUM(CAST(REPLACE(REPLACE(COALESCE(comision_monto,'0'),',',''),'$','') AS REAL)) as comisiones
      FROM expedientes WHERE asesor_id IS NOT NULL
      GROUP BY asesor_id ORDER BY cierres DESC, ingresos DESC LIMIT 10`).all();

    top_asesores = db.prepare(`SELECT asesor_nombre,
      COUNT(*) as total,
      SUM(CASE WHEN estado='Ganado' THEN 1 ELSE 0 END) as ganados,
      SUM(CASE WHEN estado='Perdido' THEN 1 ELSE 0 END) as perdidos,
      ROUND(SUM(CASE WHEN estado='Ganado' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) as pct
      FROM leads WHERE asesor_nombre!='' GROUP BY asesor_id ORDER BY ganados DESC LIMIT 5`).all();
  }

  // ── MI DASHBOARD (asesor) ──
  let miDash = null;
  if (!isAdmin) {
    const mejorMes = db.prepare(`SELECT strftime('%Y-%m',updated_at) as mes, COUNT(*) as c
      FROM expedientes WHERE asesor_id=? AND estatus_general IN ('Activo','Firma')
      GROUP BY mes ORDER BY c DESC LIMIT 1`).get(uid);
    miDash = {
      cierres: expTotales.activos || 0,
      operaciones: expTotales.total || 0,
      ingresos: expTotales.ingreso_total_sum || 0,
      comisiones: expTotales.comision_total_sum || 0,
      mejorMes: mejorMes?.mes || '—',
      leadsMes: mes.c,
      leadsMesPasado: mesPasado.c,
      cierresMes: cierresMesActual.c,
      cierresMesPasado: cierresMesPasado.c,
    };
  }

  const recientes = db.prepare(`SELECT * FROM leads WHERE 1=1 ${fL} ORDER BY id DESC LIMIT 10`).all();

  res.json({
    // leads
    totales, hoy: hoy.c, semana: semana.c, mes: mes.c, mesPasado: mesPasado.c,
    pct_cierre, pct_perdida, top_asesores, recientes,
    leadsPorMes, leadsSinSeguimiento,
    // expedientes
    expTotales, ultimoCierre, mesMasCierres, tipoPropMasCerrado,
    cierresPorMes, ingresosPorMes, ticketPorTipo,
    tipoPorInmueble, zonasTop, tiempoPromCierre,
    cierresMesActual: cierresMesActual.c, cierresMesPasado: cierresMesPasado.c,
    ingresosMesActual: ingresosMesActual.tot || 0,
    ingresosMesPasado: ingresosMesPasado.tot || 0,
    rankingAsesores,
    // alertas
    polizasPorVencer, expEstancados, sinDictamen, formsSinLlenar,
    // cartera
    cartera90,
    // cancelaciones
    cancelaciones, polizasActivas: polizasActivas.c, cancelacionesPorAsesor, ultimasCancelaciones,
    // incumplimientos
    incumplimientosStats, tiempoPromResolucion,
    // quejas
    quejasStats, tiempoPromQueja, quejasPorAsesor,
    // jurídico
    juridicoStats, juridicoMes: juridicoMes.c, juridicoPasado: juridicoPasado.c,
    // control operativo
    dictamenMes: dictamenMes.c, dictamenPasado: dictamenPasado.c,
    tiempoPromInvestigacion, arrendatariosNoCompletos: arrendatariosNoCompletos.c,
    // mi dash
    miDash
  });
});

module.exports = r;
