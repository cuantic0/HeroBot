import pkg from '@whiskeysockets/baileys';  
const { makeWASocket, DisconnectReason, useMultiFileAuthState, WAMessage, proto } = pkg;
import { Boom } from '@hapi/boom';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendMessageToChat } from './AIconnect.js';

// Obtener el directorio del archivo actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Arreglos para los grupos y administradores permitidos
const TARGET_GROUP_IDS = ['120363341864492992@g.us', "120363343269312032@g.us", "120363362940692942@g.us" ]; // Sustituir con los IDs de los grupos permitidos
const ALLOWED_ADMINS = ['5492615879232@s.whatsapp.net']; // Sustituir con los números de administradores permitidos

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(__dirname, './auth_info'));

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error instanceof Boom && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexión cerrada:');
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Conexión abierta');
        }
    });

    // Escuchar eventos relacionados con los mensajes
    sock.ev.on('messages.upsert', async (m) => {
        const message = m.messages[0];
        if (message.key.remoteJid === 'status@broadcast') return;
        if (!message.message) return;
        const text = message.message.conversation || message.message.extendedTextMessage?.text || "";

        // Validar que el mensaje provenga de un grupo permitido y del admin autorizado
        const fromMe = message.key.fromMe; // Si el mensaje es del bot
        const isAllowedGroup = TARGET_GROUP_IDS.includes(message.key.remoteJid);
        // Verificar si el usuario tiene permisos (es admin o es el bot)
        const isAllowedAdmin = ALLOWED_ADMINS.includes(message.key.participant);

        if (isAllowedGroup && (fromMe || isAllowedAdmin)) {
            console.log(message);
            // Si el mensaje comienza con '!', lo procesamos a través de la función sendMessageToChat
            if (text.startsWith('!')) {
                const userQuery = text.substring(1); // Remover el "!" del comando

                if (userQuery === 'tag') {
                    try {
                        const groupMetadata = await sock.groupMetadata(message.key.remoteJid);
                        const participants = groupMetadata.participants;

                        // Extrae los JIDs de los participantes
                        const mentionedJids = participants.map(participant => participant.id);
                        const IaTag = await sendMessageToChat("El admin a pedido mencionar a todos, solo rolea como si hablaras con todos por el comunicador diciendoles que se necesita su presencia, no digas lugares o asuntos especificos en tu rol, pero asegurate de llamar a estudiantes; maestros; profesionales y todos, solo di que se requiere su presencia");

                        // Crea el mensaje que deseas enviar
                        const messageText = `${IaTag} 👋\n${mentionedJids.map(jid => `@${jid.split('@')[0]}`).join(' ')}`;

                        // Si el mensaje es una respuesta, etiquetamos a todos en la respuesta
                        if (message.message.extendedTextMessage && message.message.extendedTextMessage.contextInfo?.quotedMessage) {
                            // Responder al mensaje original con el mensaje etiquetando a todos
                            await sock.sendMessage(message.key.remoteJid, {
                                text: messageText,
                                mentions: mentionedJids,
                                quoted: message
                            });
                        } else {
                            // Si no es respuesta, enviamos un mensaje normal
                            await sock.sendMessage(message.key.remoteJid, {
                                text: messageText,
                                mentions: mentionedJids
                            });
                        }

                        console.log("Mensaje enviado con éxito!");
                    } catch (error) {
                        console.error('Error al procesar el comando !tag:', error);
                    }
                } else {
                    try {
                        const response = await sendMessageToChat(userQuery); // Asumimos que esta función está definida en otro lugar
                        await sock.sendMessage(message.key.remoteJid, { text: response, quoted: message });
                    } catch (error) {
                        console.error('Error al procesar el mensaje:', error);
                        await sock.sendMessage(message.key.remoteJid, { text: 'Lo siento, no pude procesar el mensaje. Intenta de nuevo.' });
                    }
                }
            }
        } else {
            console.log('Acceso denegado: El mensaje no proviene de un grupo permitido o el usuario no tiene permisos.');
        }
    });

    // Escuchar eventos de cambios en el grupo (nuevos miembros, salida de miembros)
    sock.ev.on('group-participants.update', async (event) => {
        const { remoteJid, participants, action } = event;

        // Verificar que el evento provenga de uno de los grupos permitidos
        if (!TARGET_GROUP_IDS.includes(remoteJid)) return;

        // Acciones de bienvenida y despedida
        for (let participant of participants) {
            if (action === 'add') {
                // Saludar a nuevos miembros
                const welcomeMessage = await sendMessageToChat(`se ah añadido a ${participant.split('@')[0]} al grupo, dale tremenda bienvenida!`);
                await sock.sendMessage(remoteJid, { text: welcomeMessage, mentions: [participant] });
            } else if (action === 'remove') {
                // Despedir a los que se van
                const farewellMessage = await sendMessageToChat(`se ah retirado a ${participant.split('@')[0]} del grupo, dale un adios!`);
                await sock.sendMessage(remoteJid, { text: farewellMessage, mentions: [participant] });
            }
        }
    });
}

// Iniciar la conexión a WhatsApp
connectToWhatsApp();

