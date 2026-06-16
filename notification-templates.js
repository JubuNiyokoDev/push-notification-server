// 30+ notification templates organisés par catégorie
// Chaque template supporte {name} et {value} comme placeholders

const templates = {
  // ── INACTIVITÉ (comme Duolingo) ───────────────────────────────────────────
  inactivity_3days: [
    {
      title: "Tu n'as pas vérifié tes finances",
      body: "3 jours sans Ikigabo... tes dépenses t'attendent !",
    },
    {
      title: "Ikigabo a des nouvelles pour toi",
      body: "Ouvre l'app pour voir l'état de tes finances.",
    },
  ],
  inactivity_5days: [
    {
      title: "5 jours sans suivi financier",
      body: "Tes habitudes d'épargne te manquent. Reviens !",
    },
    {
      title: "Est-ce que tout va bien ?",
      body: "Tu n'as pas noté de transaction depuis 5 jours.",
    },
  ],
  inactivity_7days: [
    {
      title: "Une semaine sans Ikigabo",
      body: "C'est le moment de faire le point sur tes finances de la semaine.",
    },
    {
      title: "Tes objectifs financiers t'attendent",
      body: "7 jours passés — vérifie où tu en es.",
    },
  ],
  inactivity_14days: [
    {
      title: "Ikigabo te manque...",
      body: "2 semaines sans suivi. Tes finances ont peut-être besoin d'attention.",
    },
    {
      title: "Reprends le contrôle",
      body: "Un petit regard sur tes finances peut changer ta semaine.",
    },
  ],
  inactivity_30days: [
    {
      title: "Un mois — c'est le moment !",
      body: "Un mois sans Ikigabo. Commence le mois prochain avec un bon suivi.",
    },
    {
      title: "Ton futur financier commence aujourd'hui",
      body: "Reviens sur Ikigabo et reprends tes bonnes habitudes.",
    },
  ],

  // ── HABITUDES (basées sur le rythme réel de l'utilisateur) ───────────────
  habit_deposit_missed: [
    {
      title: "Tu déposes d'habitude plus souvent",
      body: "Tu avais l'habitude de noter tes revenus régulièrement. N'oublie pas !",
    },
    {
      title: "Suivi de tes revenus",
      body: "Tes dépôts habituels ? C'est le moment de les noter.",
    },
  ],
  habit_expense_missed: [
    {
      title: "Tes dépenses de la journée ?",
      body: "Tu notes habituellement tes achats quotidiens. Garde cette bonne habitude !",
    },
    {
      title: "Note tes dépenses",
      body: "Chaque dépense notée = meilleur contrôle financier.",
    },
  ],
  habit_weekly_review: [
    {
      title: "Résumé de ta semaine",
      body: "C'est lundi — fais le point sur les dépenses de la semaine passée.",
    },
    {
      title: "Bilan hebdomadaire",
      body: "Ouvre Ikigabo pour voir comment tu as géré tes finances cette semaine.",
    },
  ],
  habit_morning_check: [
    {
      title: "Bonjour ! Commence bien ta journée",
      body: "Un coup d'œil sur tes finances le matin = journée mieux gérée.",
    },
    {
      title: "Revue matinale",
      body: "Tes finances sont prêtes pour la journée. Vérifie-les !",
    },
  ],

  // ── DETTES ────────────────────────────────────────────────────────────────
  debt_overdue: [
    {
      title: "Dette en retard !",
      body: "Tu as {value} BIF de dettes en retard. Règle-les dès que possible.",
    },
    {
      title: "Paiement manqué",
      body: "Une dette est dépassée. Ouvre Ikigabo pour voir les détails.",
    },
  ],
  debt_due_tomorrow: [
    {
      title: "Demain : paiement de dette",
      body: "N'oublie pas : {value} BIF à payer demain.",
    },
    {
      title: "Rappel urgent",
      body: "Ton paiement est dû demain. Prépare-toi !",
    },
  ],
  debt_due_3days: [
    {
      title: "Dans 3 jours : paiement dû",
      body: "Tu as {value} BIF à rembourser dans 3 jours.",
    },
    {
      title: "Rappel de dette",
      body: "Prépare ton remboursement — il est dû dans 3 jours.",
    },
  ],
  debt_due_7days: [
    {
      title: "Rappel : dette dans 1 semaine",
      body: "{value} BIF à rembourser dans 7 jours. Plan ta trésorerie.",
    },
    {
      title: "Échéance dans 7 jours",
      body: "Assure-toi d'avoir les fonds nécessaires pour ton remboursement.",
    },
  ],

  // ── BUDGETS ───────────────────────────────────────────────────────────────
  budget_80_percent: [
    {
      title: "Budget à 80%",
      body: "Tu as utilisé 80% de ton budget. Ralentis les dépenses !",
    },
    {
      title: "Attention au budget",
      body: "Il reste seulement 20% de ton budget mensuel.",
    },
  ],
  budget_90_percent: [
    {
      title: "Budget presque épuisé (90%)",
      body: "Sois prudent — seulement 10% de ton budget restant.",
    },
    {
      title: "Limite du budget approche",
      body: "Tu approches la limite de ton budget. Vérifie avant de dépenser.",
    },
  ],
  budget_exceeded: [
    {
      title: "Budget dépassé !",
      body: "Tu as dépassé ton budget. Ouvre Ikigabo pour voir comment récupérer.",
    },
    {
      title: "Dépassement de budget",
      body: "Ton budget est dépassé ce mois. Revois tes dépenses.",
    },
  ],
  budget_end_of_month: [
    {
      title: "Fin du mois dans 5 jours",
      body: "Il reste 5 jours — gère bien ton budget pour finir en beauté.",
    },
    {
      title: "Dernier sprint du mois",
      body: "Encore 5 jours. Tu peux atteindre tes objectifs financiers !",
    },
  ],

  // ── MOTIVATION & MILESTONES ────────────────────────────────────────────────
  milestone_first_week: [
    {
      title: "1 semaine avec Ikigabo !",
      body: "Bravo ! Tu as commencé à suivre tes finances. Continue comme ça !",
    },
  ],
  milestone_first_month: [
    {
      title: "1 mois de suivi financier !",
      body: "Incroyable ! Un mois avec Ikigabo. Tu construis de bonnes habitudes.",
    },
  ],
  milestone_50_transactions: [
    {
      title: "50 transactions enregistrées !",
      body: "Tu es un pro du suivi financier. 50 transactions notées !",
    },
  ],
  milestone_savings_positive: [
    {
      title: "Tu épargnes plus que tu dépenses !",
      body: "Ce mois, tes revenus dépassent tes dépenses. Excellente gestion !",
    },
  ],

  // ── CONSEILS FINANCIERS (envoyés périodiquement) ──────────────────────────
  tip_monday: [
    {
      title: "Astuce du lundi",
      body: "Planifie tes dépenses de la semaine aujourd'hui pour mieux contrôler ton budget.",
    },
    {
      title: "Nouveau départ chaque lundi",
      body: "Un budget hebdomadaire bien planifié évite les surprises de fin de mois.",
    },
  ],
  tip_friday: [
    {
      title: "Bilan de fin de semaine",
      body: "Avant le week-end, fais le point sur tes dépenses de la semaine.",
    },
    {
      title: "Vérification vendredi",
      body: "Note tes dépenses de la semaine avant de commencer le weekend.",
    },
  ],
  tip_savings: [
    {
      title: "Astuce épargne",
      body: "Règle 1 : payez-vous d'abord. Mettez de côté avant de dépenser.",
    },
    {
      title: "Conseil financier",
      body: "Économiser 10% de chaque revenu peut changer ta vie financière.",
    },
  ],
  tip_backup: [
    {
      title: "N'oublie pas ta sauvegarde",
      body: "Sauvegarde tes données Ikigabo pour ne rien perdre.",
    },
    {
      title: "Protège tes données financières",
      body: "Fais une sauvegarde de tes données depuis les paramètres.",
    },
  ],

  // ── ENGAGEMENT FORT ────────────────────────────────────────────────────────
  streak_encouragement: [
    {
      title: "Continue sur ta lancée !",
      body: "Tu utilises Ikigabo régulièrement. Cette habitude va changer tes finances.",
    },
    {
      title: "Tu es sur la bonne voie !",
      body: "Chaque transaction notée te rapproche de tes objectifs financiers.",
    },
  ],
  year_end: [
    {
      title: "Fin d'année : bilan financier !",
      body: "C'est le moment de faire le bilan de l'année et de planifier la prochaine.",
    },
  ],
};

function getTemplate(type) {
  const list = templates[type];
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function buildNotification(type, fcmToken, data = {}) {
  const tpl = getTemplate(type);
  if (!tpl) return null;

  let body = tpl.body;
  if (data.value)
    body = body.replace("{value}", Number(data.value).toLocaleString("fr-FR"));
  if (data.name) body = body.replace("{name}", data.name);

  return {
    token: fcmToken,
    notification: { title: tpl.title, body },
    android: {
      priority: "high",
      notification: {
        channelId: "ikigabo_notifications",
        icon: "launcher_icon",
        color: "#6C63FF",
        clickAction: "FLUTTER_NOTIFICATION_CLICK",
      },
    },
    data: {
      type,
      ...Object.fromEntries(
        Object.entries(data).map(([k, v]) => [k, String(v)]),
      ),
    },
  };
}

module.exports = { buildNotification, getTemplate };
