import pkg from '@whiskeysockets/baileys';  
const { makeWASocket, DisconnectReason, useMultiFileAuthState, WAMessage, proto } = pkg;
import { Boom } from '@hapi/boom';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendMessageToChat } from './AIconnect.js';

// Obtener el directorio del archivo actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración para grupos y administradores permitidos
const TARGET_GROUP_IDS = ['120363341864492992@g.us', "120363343269312032@g.us", "120363362940692942@g.us"];
const ALLOWED_ADMINS = ['5492615879232@s.whatsapp.net'];

// Configurar Express
const app = express();
const PORT = process.env.PORT || 3000;

// Ruta principal para verificar que el servidor esté activo
app.get('/', (req, res) => {
    res.send('ON');
    console.log('app servida')
});

// Función principal para conectar a WhatsApp
async function connectToWhatsApp() {
    try {
        // Cargar estado de autenticación
        const { state, saveCreds } = await useMultiFileAuthState(path.resolve(__dirname, './auth_info'));

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true // Imprimir código QR en la terminal
        });

        // Guardar credenciales actualizadas
        sock.ev.on('creds.update', saveCreds);

        // Manejar eventos de conexión
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect.error instanceof Boom && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
                console.log('Conexión cerrada.');
                if (shouldReconnect) {
                    connectToWhatsApp(); // Reconectar automáticamente si no fue un logout
                }
            } else if (connection === 'open') {
                console.log('Conexión abierta a WhatsApp.');
            }
        });

        // Manejar mensajes entrantes
        sock.ev.on('messages.upsert', async (m) => {
            const message = m.messages[0];
            if (message.key.remoteJid === 'status@broadcast') return; // Ignorar mensajes de estado
            if (!message.message) return;

            const text = message.message.conversation || message.message.extendedTextMessage?.text || "";
            const fromMe = message.key.fromMe;
            const isAllowedGroup = TARGET_GROUP_IDS.includes(message.key.remoteJid);
            const isAllowedAdmin = ALLOWED_ADMINS.includes(message.key.participant);

            if (isAllowedGroup && (fromMe || isAllowedAdmin)) {
                if (text.startsWith('!')) {
                    const userQuery = text.substring(1);

                    if (userQuery === 'tag') {
                        try {
                            const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
                            const participants = groupMetadata.participants.map(p => p.id);
                            const IaTag = await sendMessageToChat("El admin ha pedido mencionar a todos...");
                            const messageText = `${IaTag} 👋\n${participants.map(jid => `@${jid.split('@')[0]}`).join(' ')}`;

                            await sock.sendMessage(message.key.remoteJid, {
                                text: messageText,
                                mentions: participants
                            });
                        } catch (error) {
                            console.error('Error al procesar el comando !tag:', error);
                        }
                    } else {
                        try {
                            const response = await sendMessageToChat(userQuery);
                            await sock.sendMessage(message.key.remoteJid, { text: response, quoted: message });
                        } catch (error) {
                            console.error('Error al procesar el mensaje:', error);
                            await sock.sendMessage(message.key.remoteJid, { text: 'Lo siento, no pude procesar el mensaje. Intenta de nuevo.' });
                        }
                    }
                }
            } else {
                console.log('Acceso denegado: Mensaje no permitido.');
            }
        });

        // Manejar eventos de cambios en el grupo
        sock.ev.on('group-participants.update', async (event) => {
            const { remoteJid, participants, action } = event;

            if (!TARGET_GROUP_IDS.includes(remoteJid)) return;

            for (let participant of participants) {
                if (action === 'add') {
                    const welcomeMessage = await sendMessageToChat(`Se ha añadido a ${participant.split('@')[0]} al grupo, ¡dale tremenda bienvenida!`);
                    await sock.sendMessage(remoteJid, { text: welcomeMessage, mentions: [participant] });
                } else if (action === 'remove') {
                    const farewellMessage = await sendMessageToChat(`Se ha retirado a ${participant.split('@')[0]} del grupo. ¡Dale un adiós!`);
                    await sock.sendMessage(remoteJid, { text: farewellMessage, mentions: [participant] });
                }
            }
        });
    } catch (error) {
        console.error('Error conectándose a WhatsApp:', error);
    }
}


// Iniciar servidor Express inmediatamente
app.listen(PORT, () => {
    console.log(`Servidor Express iniciado en${PORT}`);
});

// Iniciar conexión a WhatsApp después de inicializar Express
connectToWhatsApp();




