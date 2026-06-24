// Arranca el CRM (para Render — sin bot de WhatsApp)
require('dotenv').config();
require('./crm/server');

// Recordatorios solo por email cuando corre en Render sin WhatsApp
const { iniciarCronRecordatorios } = require('./crm/recordatorios');
iniciarCronRecordatorios(null); // null = no WhatsApp, solo email
