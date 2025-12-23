import { createRequire } from "module";
const require = createRequire(import.meta.url);

const admin = require("firebase-admin");
const serviceAccount = require("../serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const ADMIN_EMAIL = "ercan21@gmail.com";
const ADMIN_NAME = "Gol D. Roger";

async function setupDatabase() {
  console.log("Veritabani yapilandirmasi baslatiliyor...");

  try {
    const userRecord = await admin.auth().getUserByEmail(ADMIN_EMAIL).catch(() => null);

    if (!userRecord) {
      console.log("HATA: Belirtilen e-posta ile kayitli kullanici bulunamadi. Lutfen once siteden giris yapiniz.");
      return;
    }

    const adminUid = userRecord.uid;
    
    // Admin Yetkisi (Custom Claim)
    await admin.auth().setCustomUserClaims(adminUid, { admin: true });

    // Kullanıcı Dokümanı
    await db.collection("users").doc(adminUid).set({
      email: ADMIN_EMAIL,
      displayName: ADMIN_NAME,
      role: "admin",
      status: "active",
      membershipType: "platinum",
      subscriptionStart: admin.firestore.FieldValue.serverTimestamp(),
      subscriptionEnd: admin.firestore.Timestamp.fromDate(new Date("2099-12-31")),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      stats: {
        totalQuestionsSolved: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalEmpty: 0,
        successRate: 0,
        totalTimeSpent: 0,
        completedTests: 0,
        completedExams: 0,
        lastActivity: null
      },
      preferences: {
        theme: "dark",
        notifications: true,
        emailUpdates: true
      },
      metadata: {
        deviceInfo: "Setup Script",
        ipAddress: "127.0.0.1",
        version: "1.0.0"
      }
    }, { merge: true });

    // Alt Koleksiyonlar (Placeholder)
    await db.collection("users").doc(adminUid).collection("favorites").doc("_init_").set({
      placeholder: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("users").doc(adminUid).collection("wrongs").doc("_init_").set({
      placeholder: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("users").doc(adminUid).collection("exam_history").doc("_init_").set({
      placeholder: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Sistem Ayarları
    await db.collection("system").doc("roles").set({
      definedRoles: ["admin", "editor", "student"],
      defaultRole: "student",
      permissions: {
        admin: ["manage_users", "manage_content", "view_reports", "edit_settings", "approve_users"],
        editor: ["manage_content", "view_reports"],
        student: ["view_content", "take_exams", "view_own_stats"]
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await db.collection("system").doc("settings").set({
      registrationOpen: true,
      requireApproval: true,
      maintenanceMode: false,
      currentExamTerm: "2025-GYS",
      contactEmail: ADMIN_EMAIL,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log("Islem basariyla tamamlandi. Admin yetkileri ve veritabani semasi olusturuldu.");

  } catch (error) {
    console.error("Islem sirasinda hata olustu:", error);
  }
}

setupDatabase();