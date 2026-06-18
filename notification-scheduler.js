const cron = require("node-cron");
const admin = require("firebase-admin");
const { buildNotification } = require("./notification-templates");

// Variables lazy-loaded (initialisées après Firebase)
let firestore;
let messaging;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GLOBAL_COOLDOWN_MS = 18 * HOUR_MS;
const RESERVATION_MS = 5 * 60 * 1000;

function initializeFirebase() {
  firestore = admin.firestore();
  messaging = admin.messaging();
}

function localDayKey(timestamp = Date.now()) {
  // Africa/Bujumbura est UTC+2 toute l'annee.
  return new Date(timestamp + 2 * HOUR_MS).toISOString().slice(0, 10);
}

function typeCooldownMs(type) {
  if (type === "debt_overdue") return 2 * DAY_MS;
  if (type.startsWith("debt_due_")) return 3 * DAY_MS;
  if (type.startsWith("budget_")) return 7 * DAY_MS;
  if (type.startsWith("inactivity_")) return 30 * DAY_MS;
  if (type.startsWith("habit_")) return 4 * DAY_MS;
  if (type.startsWith("tip_")) return 6 * DAY_MS;
  if (type.startsWith("milestone_")) return 3650 * DAY_MS;
  return 7 * DAY_MS;
}

function canSendType(preferences = {}, type) {
  if (preferences.pushEnabled === false) return false;

  if (type === "debt_overdue") {
    return preferences.overdueAlerts !== false;
  }

  if (type.startsWith("debt_due_")) {
    return preferences.debtReminders !== false;
  }

  if (type.startsWith("budget_")) {
    return preferences.budgetAlerts !== false;
  }

  if (type === "tip_backup") {
    return preferences.backupReminders !== false;
  }

  if (type.startsWith("milestone_")) {
    return preferences.wealthMilestones !== false;
  }

  if (
    type.startsWith("inactivity_") ||
    type.startsWith("habit_") ||
    type.startsWith("tip_") ||
    type.startsWith("streak_") ||
    type === "year_end"
  ) {
    return preferences.smartReminders !== false;
  }

  return true;
}

async function isCanonicalTokenOwner(userId, fcmToken) {
  const snapshot = await firestore
    .collection("pushUsers")
    .where("fcmToken", "==", fcmToken)
    .get();

  if (snapshot.size <= 1) return true;

  const canonical = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      updatedAt: Number(doc.data().updatedAt || 0),
    }))
    .sort(
      (a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id),
    )[0];

  return canonical.id === userId;
}

async function reserveSendSlot(userId, type) {
  const userRef = firestore.collection("pushUsers").doc(userId);
  const now = Date.now();

  return firestore.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) return null;

    const userData = userDoc.data();
    const {
      fcmToken,
      notifications = {},
      notificationPreferences = {},
    } = userData;

    if (!fcmToken || !canSendType(notificationPreferences, type)) return null;

    const pendingUntil = Number(notifications.pendingUntil || 0);
    if (pendingUntil > now) return null;

    const lastSentAt = Number(notifications.lastSentAt || 0);
    if (now - lastSentAt < GLOBAL_COOLDOWN_MS) return null;

    const dayKey = localDayKey(now);
    const sentToday =
      notifications.dayKey === dayKey
        ? Number(notifications.sentToday || 0)
        : 0;
    if (sentToday >= 1) return null;

    const lastSentByType = notifications.lastSentByType || {};
    const lastTypeSentAt = Number(lastSentByType[type] || 0);
    if (now - lastTypeSentAt < typeCooldownMs(type)) return null;

    transaction.update(userRef, {
      "notifications.pendingType": type,
      "notifications.pendingUntil": now + RESERVATION_MS,
    });

    return { fcmToken, dayKey, sentToday };
  });
}

async function clearReservation(userId, type) {
  const userRef = firestore.collection("pushUsers").doc(userId);
  await firestore.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) return;
    const notifications = userDoc.data().notifications || {};
    if (notifications.pendingType !== type) return;
    transaction.update(userRef, {
      "notifications.pendingType": admin.firestore.FieldValue.delete(),
      "notifications.pendingUntil": admin.firestore.FieldValue.delete(),
    });
  });
}

// ── Envoyer une notification FCM ─────────────────────────────────────────────
async function sendPush(userId, type, data = {}) {
  let reserved = false;
  try {
    const userDoc = await firestore.collection("pushUsers").doc(userId).get();
    if (!userDoc.exists) return false;

    const { fcmToken } = userDoc.data();
    if (!fcmToken) return false;
    if (!(await isCanonicalTokenOwner(userId, fcmToken))) return false;

    const slot = await reserveSendSlot(userId, type);
    if (!slot) return false;
    reserved = true;

    const notificationId = `server_${type}_${slot.dayKey}`;
    const message = buildNotification(type, fcmToken, {
      ...data,
      notificationId,
    });
    if (!message) {
      await clearReservation(userId, type);
      return false;
    }

    await messaging.send(message);

    const sentAt = Date.now();
    await firestore
      .collection("pushUsers")
      .doc(userId)
      .update({
        "notifications.lastSentAt": sentAt,
        "notifications.lastType": type,
        [`notifications.lastSentByType.${type}`]: sentAt,
        "notifications.dayKey": slot.dayKey,
        "notifications.sentToday": slot.sentToday + 1,
        "notifications.pendingType": admin.firestore.FieldValue.delete(),
        "notifications.pendingUntil": admin.firestore.FieldValue.delete(),
        "notifications.sentCount": admin.firestore.FieldValue.increment(1),
      });

    console.log(`✅ Push envoyé [${type}] → ${userId}`);
    return true;
  } catch (e) {
    if (reserved) {
      try {
        await clearReservation(userId, type);
      } catch (_) {}
    }
    if (e.code === "messaging/registration-token-not-registered") {
      await firestore
        .collection("pushUsers")
        .doc(userId)
        .update({ fcmToken: null });
      console.log(`🗑️ Token invalide supprimé: ${userId}`);
    } else {
      console.error(`❌ Push failed [${type}] → ${userId}:`, e.message);
    }
    return false;
  }
}

// ── Analyse des habitudes et envoi ciblé ─────────────────────────────────────
async function analyzeAndNotify() {
  console.log("🔍 Analyse des habitudes utilisateurs...");
  const now = Date.now();
  const snapshot = await firestore.collection("pushUsers").get();

  for (const doc of snapshot.docs) {
    const userId = doc.id;
    const data = doc.data();
    const { habits = {}, lastActiveAt = 0 } = data;

    const inactiveDays = (now - lastActiveAt) / (1000 * 60 * 60 * 24);
    // Une seule regle gagne par analyse, de la plus utile a la plus generale.
    if (habits.debtsOverdue > 0) {
      await sendPush(userId, "debt_overdue", {
        value: habits.totalDebtRemaining,
      });
    } else if (habits.debtsDueSoon > 0) {
      await sendPush(userId, "debt_due_3days", {
        value: habits.totalDebtRemaining,
      });
    } else if (inactiveDays < 3 && habits.budgetsOverspent > 0) {
      await sendPush(userId, "budget_exceeded");
    } else if (inactiveDays < 3 && habits.budgetsNearLimit > 0) {
      await sendPush(userId, "budget_90_percent");
    } else if (inactiveDays >= 30) {
      await sendPush(userId, "inactivity_30days");
    } else if (inactiveDays >= 14 && inactiveDays < 30) {
      await sendPush(userId, "inactivity_14days");
    } else if (inactiveDays >= 7 && inactiveDays < 14) {
      await sendPush(userId, "inactivity_7days");
    } else if (inactiveDays >= 5 && inactiveDays < 7) {
      await sendPush(userId, "inactivity_5days");
    } else if (inactiveDays >= 3 && inactiveDays < 5) {
      await sendPush(userId, "inactivity_3days");
    } else if (inactiveDays < 3 && habits.avgTransactionsPerWeek >= 3) {
      const lastTxDays = habits.lastTransactionAt
        ? (now - habits.lastTransactionAt) / (1000 * 60 * 60 * 24)
        : 999;
      if (lastTxDays >= 2 && lastTxDays < 4) {
        await sendPush(userId, "habit_deposit_missed");
      }
    } else if (
      habits.totalTransactions >= 5 &&
      habits.totalTransactions < 15 &&
      inactiveDays < 1
    ) {
      await sendPush(userId, "milestone_first_week");
    }

    // Petit délai entre chaque user pour éviter les rate limits FCM
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`✅ Analyse terminée: ${snapshot.size} utilisateurs vérifiés`);
}

// ── Jobs planifiés ────────────────────────────────────────────────────────────
function startScheduler() {
  initializeFirebase();

  // Analyse principale : toutes les 2h, decalee des jobs editoriaux.
  cron.schedule("17 */2 * * *", analyzeAndNotify, {
    timezone: "Africa/Bujumbura",
  });

  // Astuce du lundi matin (8h heure locale)
  cron.schedule(
    "0 8 * * 1",
    async () => {
      const snapshot = await firestore.collection("pushUsers").get();
      for (const doc of snapshot.docs) {
        await sendPush(doc.id, "tip_monday");
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    { timezone: "Africa/Bujumbura" },
  );

  // Bilan vendredi soir (18h)
  cron.schedule(
    "0 18 * * 5",
    async () => {
      const snapshot = await firestore.collection("pushUsers").get();
      for (const doc of snapshot.docs) {
        const { lastActiveAt = 0 } = doc.data();
        const inactiveDays =
          (Date.now() - lastActiveAt) / (1000 * 60 * 60 * 24);
        if (inactiveDays < 7) await sendPush(doc.id, "tip_friday");
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    { timezone: "Africa/Bujumbura" },
  );

  // Rappel hebdomadaire le dimanche soir (20h) — revue de semaine
  cron.schedule(
    "0 20 * * 0",
    async () => {
      const snapshot = await firestore.collection("pushUsers").get();
      for (const doc of snapshot.docs) {
        const { lastActiveAt = 0 } = doc.data();
        const inactiveDays =
          (Date.now() - lastActiveAt) / (1000 * 60 * 60 * 24);
        if (inactiveDays < 14) await sendPush(doc.id, "habit_weekly_review");
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    { timezone: "Africa/Bujumbura" },
  );

  // Fin de mois (le 26 de chaque mois à 10h)
  cron.schedule(
    "0 10 26 * *",
    async () => {
      const snapshot = await firestore.collection("pushUsers").get();
      for (const doc of snapshot.docs) {
        const { lastActiveAt = 0 } = doc.data();
        const inactiveDays =
          (Date.now() - lastActiveAt) / (1000 * 60 * 60 * 24);
        if (inactiveDays < 10) await sendPush(doc.id, "budget_end_of_month");
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    { timezone: "Africa/Bujumbura" },
  );

  console.log("⏰ Scheduler de notifications démarré");
}

module.exports = { startScheduler, sendPush, analyzeAndNotify };
