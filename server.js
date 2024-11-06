const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const serviceAccount = require('./config/serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://tuyage-burundi-default-rtdb.firebaseio.com/",
});

const firestore = admin.firestore(); // Initialiser Firestore

// Fonction pour mettre à jour le statut des utilisateurs dans Firebase Realtime Database et Firestore
const updateStatus = async (userId, isOnline) => {
    try {
        const statusRef = admin.database().ref(`status/${userId}`);
        const userDoc = await firestore.collection('users').doc(userId).get();
        const currentRealtimeStatus = (await statusRef.once('value')).val();
        const currentFirestoreStatus = userDoc.data();

        const shouldUpdateRealtime = !currentRealtimeStatus || currentRealtimeStatus.active !== isOnline;
        const shouldUpdateFirestore = !currentFirestoreStatus || currentFirestoreStatus.active !== isOnline;

        if (!shouldUpdateRealtime && !shouldUpdateFirestore) {
            console.log(`User ${userId} status is already ${isOnline ? 'online' : 'offline'}`);
            return;
        }

        const updates = [];

        const currentTimestamp = Date.now();

        if (shouldUpdateRealtime) {
            const realtimeUpdate = statusRef.set({
                active: isOnline,
                lastSeen: currentTimestamp, // Utiliser le timestamp actuel
            });
            updates.push(realtimeUpdate);
        }

        if (shouldUpdateFirestore) {
            const firestoreUpdate = firestore.collection('users').doc(userId).update({
                active: isOnline,
                lastSeen: currentTimestamp, // Utiliser le timestamp actuel
            });
            updates.push(firestoreUpdate);
        }

        await Promise.all(updates);

        console.log(`User ${userId} status updated to ${isOnline ? 'online' : 'offline'}`);
    } catch (error) {
        console.error(`Failed to update status for user ${userId}:`, error);
    }
};

// Middleware pour traiter les requêtes JSON
app.use(express.json());

// Route de test
app.get('/', (req, res) => {
    res.send('Server is running');
});

// Gestion des connexions WebSocket
wss.on('connection', (ws) => {
    console.log('Client connected');
    let userId;

    // Envoi de ping périodique
    const pingInterval = setInterval(() => {
        ws.ping(); // Envoie un ping au client
    }, 30000); // 30 secondes

    ws.on('message', async (message) => {
        const data = JSON.parse(message);
        userId = data.userId;
        const isOnline = data.isOnline;
        const lastSeen = data.lastSeen; // Récupérer lastSeen du message
    
        // Récupérer l'état actuel de l'utilisateur avant de mettre à jour
        const userStatusRef = admin.database().ref(`status/${userId}`);
        const userStatusSnapshot = await userStatusRef.once('value');
        const currentStatus = userStatusSnapshot.val();
    
        // Ne mettez à jour que si le statut actuel est 'offline'
        if (!currentStatus || !currentStatus.active) {
            await updateStatus(userId, true); // Mettez à jour le statut à 'online'
        } else {
            // Met à jour lastSeen si l'utilisateur est déjà en ligne
            await firestore.collection('users').doc(userId).update({
                lastSeen: lastSeen, // Utiliser lastSeen du message
            });
        }
    
        // Répondre avec un pong pour signaler que le serveur est toujours connecté
        ws.send(JSON.stringify({ type: 'pong' }));
    });
    

    ws.on('close', async () => {
        clearInterval(pingInterval); // Arrêter le ping périodique
        console.log('Client disconnected');
        if (userId) {
            await updateStatus(userId, false); // Met à jour le statut à 'offline'
            console.log(`User ${userId} status updated to offline on disconnect`);
        }
    });

    ws.on('pong', () => {
        console.log('Received pong from client');
    });
});

// Lancer le serveur sur le port 3000 ou le port défini dans les variables d'environnement
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
