const db = require('./db');

const DIAS = [60, 30, 15, 5, 1];

async function enviarRecordatorios(waClient) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const expedientes = db.prepare(`
    SELECT e.*, u.telefono as tel_asesor_db, u.email as email_asesor_db
    FROM expedientes e
    LEFT JOIN usuarios u ON e.asesor_id = u.id
    WHERE e.fin_arrendamiento != '' AND e.estatus_general NOT IN ('Cancelado','Concluido')
  `).all();

  for (const exp of expedientes) {
    const fechaFin = new Date(exp.fin_arrendamiento + 'T00:00:00');
    if (isNaN(fechaFin)) continue;

    const diffMs = fechaFin - hoy;
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    for (const dias of DIAS) {
      if (diffDias !== dias) continue;

      const existente = db.prepare('SELECT * FROM recordatorios WHERE expediente_id=? AND dias_antes=?').get(exp.id, dias);
      if (existente) continue;

      // Insertar registro
      const rec = db.prepare(`INSERT OR IGNORE INTO recordatorios
        (expediente_id, folio_expediente, dias_antes, tipo, fecha_vencimiento)
        VALUES (?,?,?,?,?)`).run(exp.id, exp.folio, dias, 'vencimiento_arrendamiento', exp.fin_arrendamiento);

      const recId = rec.lastInsertRowid;
      if (!recId) continue;

      const msg = buildMsg(exp, dias);
      let waAr = 0, waAt = 0, waAs = 0, emailAr = 0, emailAt = 0;

      // WhatsApp Arrendador
      if (waClient && exp.tel_arrendador) {
        try {
          const num = exp.tel_arrendador.replace(/\D/g, '');
          await waClient.sendMessage(`52${num}@c.us`, msg);
          waAr = 1;
        } catch (e) { console.error('WA arrendador:', e.message); }
      }

      // WhatsApp Arrendatario
      if (waClient && exp.tel_arrendatario) {
        try {
          const num = exp.tel_arrendatario.replace(/\D/g, '');
          await waClient.sendMessage(`52${num}@c.us`, msg);
          waAt = 1;
        } catch (e) { console.error('WA arrendatario:', e.message); }
      }

      // WhatsApp Asesor
      const telAsesor = exp.tel_asesor_db;
      if (waClient && telAsesor) {
        try {
          const num = telAsesor.replace(/\D/g, '');
          const msgAs = `⚠️ *Recordatorio PJM* — El contrato *${exp.folio}* de ${exp.nombre_arrendatario || 'tu cliente'} vence en *${dias} día(s)* (${exp.fin_arrendamiento}). Favor de dar seguimiento.`;
          await waClient.sendMessage(`52${num}@c.us`, msgAs);
          waAs = 1;
        } catch (e) { console.error('WA asesor:', e.message); }
      }

      // Email
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: 'polizasjuridicasm@gmail.com', pass: process.env.GMAIL_PASS || '' }
        });

        const emailSubject = `Recordatorio: Contrato ${exp.folio} vence en ${dias} día(s)`;
        const emailHtml = `<p>${msg.replace(/\n/g, '<br>').replace(/\*/g, '')}</p>`;

        if (exp.email_arrendador) {
          await transporter.sendMail({ from: 'PJM <polizasjuridicasm@gmail.com>', to: exp.email_arrendador, subject: emailSubject, html: emailHtml });
          emailAr = 1;
        }
        if (exp.email_arrendatario) {
          await transporter.sendMail({ from: 'PJM <polizasjuridicasm@gmail.com>', to: exp.email_arrendatario, subject: emailSubject, html: emailHtml });
          emailAt = 1;
        }
      } catch (e) { console.error('Email recordatorio:', e.message); }

      db.prepare(`UPDATE recordatorios SET
        enviado_wa_arrendador=?, enviado_wa_arrendatario=?, enviado_wa_asesor=?,
        enviado_email_arrendador=?, enviado_email_arrendatario=?,
        fecha_envio=CURRENT_TIMESTAMP WHERE id=?`).run(waAr, waAt, waAs, emailAr, emailAt, recId);

      console.log(`✅ Recordatorio ${dias}d enviado para ${exp.folio}`);
    }
  }
}

function buildMsg(exp, dias) {
  const parte = dias === 1 ? 'mañana' : `en *${dias} días*`;
  return `📋 *Aviso de Vencimiento — Pólizas Jurídicas Monterrey*

Estimado/a cliente,

Le informamos que su contrato con folio *${exp.folio_arrendamiento || exp.folio}* vence ${parte}, el *${exp.fin_arrendamiento}*.

🏠 Inmueble: ${exp.direccion_inmueble || 'N/D'}
💰 Renta mensual: ${exp.monto_renta || 'N/D'}
👤 Asesor: ${exp.asesor_nombre || 'N/D'}

Si desea renovar su contrato, comuníquese con nosotros lo antes posible para realizar el proceso correctamente.

📞 Pólizas Jurídicas Monterrey
polizasjuridicasmonterrey.com`;
}

function iniciarCronRecordatorios(waClient) {
  // Revisar cada día a las 9 AM (cada 24h)
  const MS_DIA = 24 * 60 * 60 * 1000;
  console.log('⏰ Cron de recordatorios iniciado');

  const run = () => {
    enviarRecordatorios(waClient).catch(e => console.error('Error cron recordatorios:', e));
  };

  // Primer check al iniciar
  setTimeout(run, 5000);

  // Después cada 24h
  setInterval(run, MS_DIA);
}

module.exports = { iniciarCronRecordatorios, enviarRecordatorios };
