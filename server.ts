import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import Razorpay from "razorpay";
import crypto from "crypto";
import cookieParser from "cookie-parser";
import session from "express-session";
import admin from "firebase-admin";
import multer from "multer";
// @ts-ignore
import pdf from "pdf-parse/lib/pdf-parse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ storage: multer.memoryStorage() });

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder_secret",
});

// Initialize Firebase Admin (lazy)
let firebaseAdminApp: admin.app.App | null = null;
function getFirebaseAdmin() {
  if (!firebaseAdminApp && process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      firebaseAdminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } catch (e) {
      console.error("Failed to initialize Firebase Admin:", e);
    }
  }
  return firebaseAdminApp;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: process.env.SESSION_SECRET || "bpsc-predictor-secret",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === "production", sameSite: "none" }
  }));

  // API: Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API: Create Razorpay Order
  app.post("/api/create-razorpay-order", async (req, res) => {
    try {
      const { userId } = req.body;
      const options = {
        amount: 49900, // ₹499.00
        currency: "INR",
        receipt: `receipt_${userId}_${Date.now()}`,
        notes: { userId },
      };
      const order = await razorpay.orders.create(options);
      res.json({
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // API: Razorpay Webhook
  app.post("/api/razorpay-webhook", async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    const signature = req.headers["x-razorpay-signature"] as string;
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (expectedSignature === signature) {
      const event = req.body.event;
      if (event === "order.paid") {
        const payload = req.body.payload.payment.entity;
        const userId = payload.notes.userId;
        const adminApp = getFirebaseAdmin();
        if (userId && adminApp) {
          await adminApp.firestore().collection("users").doc(userId).update({
            isPremium: true,
            premiumSince: new Date().toISOString(),
          });
        }
      }
      res.json({ status: "ok" });
    } else {
      res.status(400).send("Invalid signature");
    }
  });

  // API: Admin Stats
  app.get("/api/admin/stats", async (req, res) => {
    const adminApp = getFirebaseAdmin();
    if (!adminApp) {
      return res.json({
        totalUsers: 0,
        premiumUsers: 0,
        revenue: 0,
      });
    }

    try {
      const usersSnap = await adminApp.firestore().collection("users").get();
      const totalUsers = usersSnap.size;
      const premiumUsers = usersSnap.docs.filter(d => d.data().isPremium).length;
      res.json({
        totalUsers,
        premiumUsers,
        revenue: premiumUsers * 499,
      });
    } catch (e) {
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // API: Parse PDF
  app.post("/api/parse-pdf", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      const data = await pdf(req.file.buffer);
      res.json({ text: data.text, numPages: data.numpages, info: data.info });
    } catch (error: any) {
      console.error("PDF Parsing Error:", error);
      res.status(500).json({ error: "Failed to parse PDF" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
