const express = require('express');
const db = require('../db');
const { middleware } = require('../auth');

const r = express.Router();
r.use(middleware);

r.get('/', (req, res) => {
  const isAdmin = req.user.rol === 'admin';
  const uid = req.user.id;
  const filterL = isAdmin ? '' : `AND asesor_id = ${uid}`;
  const filterE = isAdmin ? '' : `AND asesor_id = ${uid}`;

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
    FROM leads WHERE 1=1 ${filterL}`).get();

  const hoy = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE DATE(fecha) = DATE('now','localtime') ${filterL}`).get();
  const semana = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE fecha >= DATE('now','-7 days','localtime') ${filterL}`).get();
  const pct_cierre = totales.total > 0 ? ((totales.ganados / totales.total) * 100).toFixed(1) : '0.0';
  const pct_perdida = totales.total > 0 ? ((totales.perdidos / totales.total) * 100).toFixed(1) : '0.0';

  // ── EXPEDIENTES / FINANCIERO ──
  const expTotales = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN estatus_general='Activo' THEN 1 ELSE 0 END) as activos,
    SUM(CASE WHEN estatus_general='Cancelado' THEN 1 ELSE 0 END) as cancelados,
    SUM(CASE WHEN tipo_contratacion='poliza' THEN 1 ELSE 0 END) as polizas,
    SUM(CASE WHEN tipo_contratacion='contrato_simple' THEN 1 ELSE 0 END) as contratos_simples,
    SUM(CAST(REPLACE(REPLACE(ingreso_total,',',''),'$','') AS REAL)) as ingreso_total_sum,
    SUM(CAST(REPLACE(REPLACE(comision_monto,',',''),'$','') AS REAL)) as comision_total_sum
    FROM expedientes WHERE 1=1 ${filterE}`).get();

  // Último cierre
  const ultimoCierre = db.prepare(`SELECT folio, nombre_arrendatario, direccion_inmueble, fin_arrendamiento, monto_renta, asesor_nombre, updated_at
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${filterE} ORDER BY updated_at DESC LIMIT 1`).get();

  // Mes con más cierres
  const mesMasCierres = db.prepare(`SELECT strftime('%Y-%m', updated_at) as mes, COUNT(*) as c
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${filterE}
    GROUP BY mes ORDER BY c DESC LIMIT 1`).get();

  // Tipo de propiedad más cerrada
  const tipoPropMasCerrado = db.prepare(`SELECT tipo_inmueble, COUNT(*) as c
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') AND tipo_inmueble != '' ${filterE}
    GROUP BY tipo_inmueble ORDER BY c DESC LIMIT 1`).get();

  // Ranking asesores
  let rankingAsesores = [];
  if (isAdmin) {
    rankingAsesores = db.prepare(`SELECT
      asesor_id, asesor_nombre,
      COUNT(*) as operaciones,
      SUM(CASE WHEN estatus_general IN ('Activo','Firma') THEN 1 ELSE 0 END) as cierres,
      SUM(CAST(REPLACE(REPLACE(ingreso_total,',',''),'$','') AS REAL)) as ingresos,
      SUM(CAST(REPLACE(REPLACE(comision_monto,',',''),'$','') AS REAL)) as comisiones
      FROM expedientes WHERE asesor_id IS NOT NULL
      GROUP BY asesor_id ORDER BY cierres DESC, ingresos DESC LIMIT 10`).all();
  }

  // Top asesores de leads
  let top_asesores = [];
  if (isAdmin) {
    top_asesores = db.prepare(`SELECT asesor_nombre,
      COUNT(*) as total,
      SUM(CASE WHEN estado='Ganado' THEN 1 ELSE 0 END) as ganados,
      SUM(CASE WHEN estado='Perdido' THEN 1 ELSE 0 END) as perdidos,
      ROUND(SUM(CASE WHEN estado='Ganado' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) as pct
      FROM leads WHERE asesor_nombre != '' GROUP BY asesor_id ORDER BY ganados DESC LIMIT 5`).all();
  }

  // Cierres por mes (últimos 6 meses) para gráfica
  const cierresPorMes = db.prepare(`SELECT strftime('%Y-%m', updated_at) as mes, COUNT(*) as c
    FROM expedientes WHERE estatus_general IN ('Activo','Firma') ${filterE}
    AND updated_at >= DATE('now','-6 months')
    GROUP BY mes ORDER BY mes ASC`).all();

  // Leads por mes (últimos 6)
  const leadsPorMes = db.prepare(`SELECT strftime('%Y-%m', fecha) as mes, COUNT(*) as c
    FROM leads WHERE 1=1 ${filterL}
    AND fecha >= DATE('now','-6 months')
    GROUP BY mes ORDER BY mes ASC`).all();

  const por_intencion = db.prepare(`SELECT intencion, COUNT(*) as c FROM leads WHERE intencion != '' ${filterL} GROUP BY intencion ORDER BY c DESC`).all();
  const por_tipo = db.prepare(`SELECT tipo_usuario, COUNT(*) as c FROM leads WHERE tipo_usuario != '' ${filterL} GROUP BY tipo_usuario ORDER BY c DESC`).all();
  const recientes = db.prepare(`SELECT * FROM leads WHERE 1=1 ${filterL} ORDER BY id DESC LIMIT 10`).all();

  // Mi dashboard (asesor)
  let miDash = null;
  if (!isAdmin) {
    const mejorMes = db.prepare(`SELECT strftime('%Y-%m', updated_at) as mes, COUNT(*) as c
      FROM expedientes WHERE asesor_id=? AND estatus_general IN ('Activo','Firma')
      GROUP BY mes ORDER BY c DESC LIMIT 1`).get(uid);
    miDash = {
      cierres: expTotales.activos || 0,
      operaciones: expTotales.total || 0,
      ingresos: expTotales.ingreso_total_sum || 0,
      comisiones: expTotales.comision_total_sum || 0,
      mejorMes: mejorMes?.mes || '—',
    };
  }

  res.json({
    totales, hoy: hoy.c, semana: semana.c, pct_cierre, pct_perdida,
    top_asesores, por_intencion, por_tipo, recientes,
    expTotales, ultimoCierre, mesMasCierres, tipoPropMasCerrado,
    rankingAsesores, cierresPorMes, leadsPorMes, miDash
  });
});

module.exports = r;
