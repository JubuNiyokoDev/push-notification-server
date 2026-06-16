const cron = require("node-cron");
const admin = require("firebase-admin");
const { buildNotification } = require("./notification-templates");

// Variables lazy-loaded (initialisées après Firebase)
let firestore;
let messaging;

function initializeFirebase() {
  firestore = admin.firestore();
  messaging = admin.messaging();
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

// ── Envoyer une notification FCM ─────────────────────────────────────────────
async function sendPush(userId, type, data = {}) {
  try {
    const userDoc = await firestore.collection("pushUsers").doc(userId).get();
    if (!userDoc.exists) return;

    const {
      fcmToken,
      notifications = {},
      notificationPreferences = {},
    } = userDoc.data();
    if (!fcmToken) return;
    if (!canSendType(notificationPreferences, type)) return;

    // Cooldown global : pas plus d'1 notification par 4h par user
    const lastSentAt = notifications.lastSentAt || 0;
    const hoursSince = (Date.now() - lastSentAt) / (1000 * 60 * 60);
    if (hoursSince < 4) return;

    const message = buildNotification(type, fcmToken, data);
    if (!message) return;

    await messaging.send(message);

    // Enregistrer l'envoi
    await firestore
      .collection("pushUsers")
      .doc(userId)
      .update({
        "notifications.lastSentAt": Date.now(),
        "notifications.lastType": type,
        "notifications.sentCount": admin.firestore.FieldValue.increment(1),
      });

    console.log(`✅ Push envoyé [${type}] → ${userId}`);
  } catch (e) {
    if (e.code === "messaging/registration-token-not-registered") {
      // Token invalide → supprimer
      await firestore
        .collection("pushUsers")
        .doc(userId)
        .update({ fcmToken: null });
      console.log(`🗑️ Token invalide supprimé: ${userId}`);
    } else {
      console.error(`❌ Push failed [${type}] → ${userId}:`, e.message);
    }
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
    const { habits = {}, lastActiveAt = 0, notifications = {} } = data;

    const inactiveDays = (now - lastActiveAt) / (1000 * 60 * 60 * 24);
    const lastType = notifications.lastType || "";

    // ── Inactivité (priorité décroissante) ──────────────────────────────────
    if (inactiveDays >= 30 && lastType !== "inactivity_30days") {
      await sendPush(userId, "inactivity_30days");
    } else if (
      inactiveDays >= 14 &&
      inactiveDays < 30 &&
      lastType !== "inactivity_14days"
    ) {
      await sendPush(userId, "inactivity_14days");
    } else if (
      inactiveDays >= 7 &&
      inactiveDays < 14 &&
      lastType !== "inactivity_7days"
    ) {
      await sendPush(userId, "inactivity_7days");
    } else if (
      inactiveDays >= 5 &&
      inactiveDays < 7 &&
      lastType !== "inactivity_5days"
    ) {
      await sendPush(userId, "inactivity_5days");
    } else if (
      inactiveDays >= 3 &&
      inactiveDays < 5 &&
      lastType !== "inactivity_3days"
    ) {
      await sendPush(userId, "inactivity_3days");
    }

    // ── Dettes urgentes (actif ou inactif) ──────────────────────────────────
    else if (habits.debtsOverdue > 0) {
      await sendPush(userId, "debt_overdue", {
        value: habits.totalDebtRemaining,
      });
    } else if (habits.debtsDueSoon > 0) {
      await sendPush(userId, "debt_due_3days", {
        value: habits.totalDebtRemaining,
      });
    }

    // ── Budgets (seulement si actif récemment) ───────────────────────────────
    else if (inactiveDays < 3 && habits.budgetsOverspent > 0) {
      await sendPush(userId, "budget_exceeded");
    } else if (inactiveDays < 3 && habits.budgetsNearLimit > 0) {
      await sendPush(userId, "budget_90_percent");
    }

    // ── Habitude interrompue (actif mais sans transaction récente) ───────────
    else if (inactiveDays < 3 && habits.avgTransactionsPerWeek >= 3) {
      const lastTxDays = habits.lastTransactionAt
        ? (now - habits.lastTransactionAt) / (1000 * 60 * 60 * 24)
        : 999;
      if (lastTxDays >= 2 && lastTxDays < 4) {
        await sendPush(userId, "habit_deposit_missed");
      }
    }

    // ── Milestone: première semaine ou premier mois ──────────────────────────
    else if (
      habits.totalTransactions >= 5 &&
      habits.totalTransactions < 15 &&
      inactiveDays < 1
    ) {
      const alreadySent = (notifications.sentCount || 0) === 0;
      if (alreadySent) await sendPush(userId, "milestone_first_week");
    }

    // Petit délai entre chaque user pour éviter les rate limits FCM
    await new Promise((r) => setTimeout(r, 50));
  }

  console.log(`✅ Analyse terminée: ${snapshot.size} utilisateurs vérifiés`);
}

// ── Jobs planifiés ────────────────────────────────────────────────────────────
function startScheduler() {
  initializeFirebase();
  
  // Analyse principale : toutes les 2h
  cron.schedule("0 */2 * * *", analyzeAndNotify, {
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
