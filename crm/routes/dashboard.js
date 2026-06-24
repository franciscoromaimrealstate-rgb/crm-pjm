const express = require('express');
const db = require('../db');
const { middleware } = require('../auth');

const r = express.Router();
r.use(middleware);

r.get('/', (req, res) => {
  const isAdmin = req.user.rol === 'admin';
  const filter = isAdmin ? '' : `AND asesor_id = ${req.user.id}`;

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
    FROM leads WHERE 1=1 ${filter}`).get();

  const hoy = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE DATE(fecha) = DATE('now','localtime') ${filter}`).get();
  const semana = db.prepare(`SELECT COUNT(*) as c FROM leads WHERE fecha >= DATE('now','-7 days','localtime') ${filter}`).get();

  const pct_cierre = totales.total > 0 ? ((totales.ganados / totales.total) * 100).toFixed(1) : '0.0';
  const pct_perdida = totales.total > 0 ? ((totales.perdidos / totales.total) * 100).toFixed(1) : '0.0';

  let top_asesores = [];
  let peor_asesores = [];
  if (isAdmin) {
    top_asesores = db.prepare(`SELECT asesor_nombre,
      COUNT(*) as total,
      SUM(CASE WHEN estado='Ganado' THEN 1 ELSE 0 END) as ganados,
      SUM(CASE WHEN estado='Perdido' THEN 1 ELSE 0 END) as perdidos,
      ROUND(SUM(CASE WHEN estado='Ganado' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) as pct
      FROM leads WHERE asesor_nombre != '' GROUP BY asesor_id ORDER BY ganados DESC LIMIT 5`).all();
    peor_asesores = db.prepare(`SELECT asesor_nombre,
      COUNT(*) as total,
      SUM(CASE WHEN estado='Perdido' THEN 1 ELSE 0 END) as perdidos,
      ROUND(SUM(CASE WHEN estado='Perdido' THEN 1.0 ELSE 0 END)/COUNT(*)*100,1) as pct_perdida
      FROM leads WHERE asesor_nombre != '' AND total > 0 GROUP BY asesor_id ORDER BY perdidos DESC LIMIT 5`).all();
  }

  const por_intencion = db.prepare(`SELECT intencion, COUNT(*) as c FROM leads WHERE intencion != '' ${filter} GROUP BY intencion ORDER BY c DESC`).all();
  const por_tipo = db.prepare(`SELECT tipo_usuario, COUNT(*) as c FROM leads WHERE tipo_usuario != '' ${filter} GROUP BY tipo_usuario ORDER BY c DESC`).all();
  const recientes = db.prepare(`SELECT * FROM leads WHERE 1=1 ${filter} ORDER BY id DESC LIMIT 10`).all();

  res.json({ totales, hoy: hoy.c, semana: semana.c, pct_cierre, pct_perdida, top_asesores, peor_asesores, por_intencion, por_tipo, recientes });
});

module.exports = r;
