const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require('body-parser');

// Vérifier si la clé de service Firebase est définie via les variables d'environnement
const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
console.log(privateKey);
const serviceAccount = {
    type: process.env.FIREBASE_TYPE,
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
    private_key: privateKey,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    client_id: process.env.FIREBASE_CLIENT_ID,
    auth_uri: process.env.FIREBASE_AUTH_URI,
    token_uri: process.env.FIREBASE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

// Initialiser Firebase Admin SDK avec la clé depuis les variables d'environnement
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    console.error('Erreur lors de l\'initialisation de Firebase Admin:', error);
    console.log(serviceAccount.private_key);
    process.exit(1);
}

const firestore = admin.firestore();
const app = express();
app.use(bodyParser.json());

// Route de test pour vérifier si le serveur est opérationnel
app.get('/', (req, res) => {
    res.send('Serveur de notifications est opérationnel');
});

// Route pour stocker le token FCM dans Firestore
app.post('/store-token', async (req, res) => {
    const { userId, token } = req.body;

    if (!userId || !token) {
        return res.status(400).send('userId et token sont requis.');
    }

    try {
        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).send(`Utilisateur avec l'ID ${userId} non trouvé.`);
        } else {
            await userRef.update({
                tokens: admin.firestore.FieldValue.arrayUnion(token),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`Token ajouté pour l'utilisateur ${userId}`);
            res.status(200).send('Token stocké avec succès');
        }
    } catch (error) {
        console.error('Erreur lors du stockage du token:', error);
        res.status(500).send('Erreur lors du stockage du token');
    }
});

// Route pour envoyer des notifications
app.post('/send-notification', async (req, res) => {
    const { userId, title, body } = req.body;

    if (!userId || !title || !body) {
        return res.status(400).send('userId, titre et contenu du message sont requis.');
    }

    try {
        const userRef = firestore.collection('users').doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).send(`Utilisateur avec l'ID ${userId} non trouvé.`);
        }

        const tokens = userDoc.data().tokens;
        if (!tokens || tokens.length === 0) {
            return res.status(400).send('Aucun token disponible pour cet utilisateur.');
        }

        const message = {
            notification: {
                title: title,
                body: body,
            },
            tokens: tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log('Notification envoyée avec succès:', response);
        res.status(200).send('Notification envoyée');
        response.responses.forEach((resp, index) => {
            if (!resp.success) {
                console.error(`Erreur pour le token ${tokens[index]}:`, resp.error);
            }
        });
    } catch (error) {
        console.error("Erreur lors de l'envoi de la notification:", error);
        res.status(500).send("Erreur lors de l'envoi de la notification");
    }
});

// Démarrer le serveur sur le port 3000
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Serveur en cours d'exécution sur le port ${PORT}`);
});
