const admin = require("firebase-admin");
const express = require("express");
const bodyParser = require("body-parser");
const { startScheduler } = require("./notification-scheduler");

const requiredFirebaseEnv = [
  "FIREBASE_TYPE",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_PRIVATE_KEY_ID",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_CLIENT_ID",
  "FIREBASE_AUTH_URI",
  "FIREBASE_TOKEN_URI",
  "FIREBASE_AUTH_PROVIDER_X509_CERT_URL",
  "FIREBASE_CLIENT_X509_CERT_URL",
];

const missingFirebaseEnv = requiredFirebaseEnv.filter((key) => !process.env[key]);
if (missingFirebaseEnv.length > 0) {
  console.error(
    "Variables Firebase manquantes:",
    missingFirebaseEnv.join(", "),
  );
  process.exit(1);
}

const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
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
  universe_domain: process.env.UNIVERSE_DOMAIN,
};

// Initialiser Firebase Admin SDK avec la clé depuis les variables d'environnement
try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} catch (error) {
  console.error("Erreur lors de l'initialisation de Firebase Admin:", error);
  process.exit(1);
}

const firestore = admin.firestore();
const app = express();
app.use(bodyParser.json());

// Démarrer le scheduler de notifications
startScheduler();

// Route de test pour vérifier si le serveur est opérationnel
app.get("/", (req, res) => {
  res.send("Serveur de notifications est opérationnel");
});

// Route pour stocker le token FCM dans Firestore
app.post("/store-token", async (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res.status(400).send("userId et token sont requis.");
  }

  try {
    const userRef = firestore.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res
        .status(404)
        .send(`Utilisateur avec l'ID ${userId} non trouvé.`);
    } else {
      await userRef.update({
        tokens: admin.firestore.FieldValue.arrayUnion(token),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`Token ajouté pour l'utilisateur ${userId}`);
      res.status(200).send("Token stocké avec succès");
    }
  } catch (error) {
    console.error("Erreur lors du stockage du token:", error);
    res.status(500).send("Erreur lors du stockage du token");
  }
});

// Route pour envoyer des notifications
app.post("/send-notification", async (req, res) => {
  const { userId, title, body } = req.body;

  if (!userId || !title || !body) {
    return res
      .status(400)
      .send("userId, titre et contenu du message sont requis.");
  }

  try {
    const userRef = firestore.collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res
        .status(404)
        .send(`Utilisateur avec l'ID ${userId} non trouvé.`);
    }

    const tokens = userDoc.data().tokens;
    if (!tokens || tokens.length === 0) {
      return res
        .status(400)
        .send("Aucun token disponible pour cet utilisateur.");
    }

    const message = {
      notification: {
        title: title,
        body: body,
      },
      tokens: tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log("Notification envoyée avec succès:", response);
    res.status(200).send("Notification envoyée");
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

// ════════════════════════════════════════════════════════════════════════════
// NOUVEAUX ENDPOINTS POUR IKIGABO (Heartbeat + Notification)
// ════════════════════════════════════════════════════════════════════════════

// Heartbeat : appelé à chaque ouverture d'app Flutter
app.post("/heartbeat", async (req, res) => {
  try {
    const {
      deviceId,
      fcmToken,
      platform,
      lastActiveAt,
      locale,
      habits,
      notificationPreferences,
    } = req.body;
    if (!deviceId || !fcmToken)
      return res.status(400).json({ error: "deviceId et fcmToken requis" });

    await firestore
      .collection("pushUsers")
      .doc(deviceId)
      .set(
        {
          fcmToken,
          platform: platform || "android",
          lastActiveAt: lastActiveAt || Date.now(),
          locale: locale || "fr",
          habits: habits || {},
          notificationPreferences: notificationPreferences || {},
          updatedAt: Date.now(),
        },
        { merge: true },
      );

    console.log(`💓 Heartbeat reçu: ${deviceId}`);
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ Heartbeat error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// Preferences notifications : respecte les toggles utilisateur cote app.
app.post("/notification-preferences", async (req, res) => {
  try {
    const { deviceId, fcmToken, notificationPreferences } = req.body;
    if (!deviceId || !notificationPreferences) {
      return res.status(400).json({ error: "Parametres manquants" });
    }

    await firestore
      .collection("pushUsers")
      .doc(deviceId)
      .set(
        {
          ...(fcmToken ? { fcmToken } : {}),
          notificationPreferences,
          updatedAt: Date.now(),
        },
        { merge: true },
      );

    console.log(`⚙️ Preferences notifications mises a jour: ${deviceId}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mise à jour token FCM uniquement (appelée quand le token change)
app.post("/update-token", async (req, res) => {
  try {
    const { deviceId, fcmToken } = req.body;
    if (!deviceId || !fcmToken)
      return res.status(400).json({ error: "Paramètres manquants" });

    await firestore
      .collection("pushUsers")
      .doc(deviceId)
      .set({ fcmToken, updatedAt: Date.now() }, { merge: true });

    console.log(`🔄 Token FCM mis à jour: ${deviceId}`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats (optionnel — pour voir le nombre d'utilisateurs enregistrés)
app.get("/stats", async (req, res) => {
  try {
    const snapshot = await firestore.collection("pushUsers").get();
    const active = snapshot.docs.filter((d) => {
      const last = d.data().lastActiveAt || 0;
      return Date.now() - last < 7 * 24 * 60 * 60 * 1000;
    }).length;
    res.json({ total: snapshot.size, activeLastWeek: active });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur le port ${PORT}`);
});
