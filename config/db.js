const mongoose = require("mongoose");
const net = require("net");

// ─── فحص الاتصال بالإنترنت عبر TCP ───────────────────────────────────────
const checkInternet = () => {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        // زيادة الـ timeout لتجنب false-negative على الشبكات البطيئة
        socket.setTimeout(3000);
        socket.on("connect", () => { socket.destroy(); resolve(true); });
        socket.on("timeout", () => { socket.destroy(); resolve(false); });
        socket.on("error",   () => { socket.destroy(); resolve(false); });
        socket.connect(53, "8.8.8.8");
    });
};

// ─── الحالة الداخلية ──────────────────────────────────────────────────────
let connectionState = "idle"; // "idle" | "connecting" | "connected" | "local"
let connectPromise  = null;   // تجنب race condition: طلبات متزامنة تنتظر نفس الـ promise

// ─── الاتصال بقاعدة بيانات محددة مع انتظار جاهزية Mongoose فعلاً ─────────
const connectTo = async (uri, label, opts = {}) => {
    // لو الاتصال موجود بالفعل على نفس الـ URI — لا داعي لإعادة الاتصال
    if (mongoose.connection.readyState === 1) {
        return;
    }

    // لو الاتصال في منتصف عملية ما → قطعه أولاً
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        connectTimeoutMS: 8000,
        socketTimeoutMS: 30000,
        maxPoolSize: 10,
        ...opts,
    });

    console.log(`✅ [DB] Connected to ${label}`);
};

// ─── الـ Reconnect عند الانقطاع ───────────────────────────────────────────
mongoose.connection.on("disconnected", () => {
    const isCloud = process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.RENDER;
    if (isCloud) return; // في السحابة نتركها تعيد الاتصال بنفسها
    console.warn("⚠️ [DB] Disconnected — resetting state for next request...");
    connectionState = "idle";
    connectPromise  = null;
});

mongoose.connection.on("error", (err) => {
    console.error("❌ [DB] Mongoose error:", err.message);
    connectionState = "idle";
    connectPromise  = null;
});

// ─── الدالة الرئيسية ───────────────────────────────────────────────────────
const connectDB = async () => {
    // 1) اتصال جاهز بالفعل → ارجع فوراً
    if (mongoose.connection.readyState === 1) {
        connectionState = "connected";
        return;
    }

    // 2) لو في طلب اتصال جاري → انتظره بدل ما تبدأ واحد جديد (Race Condition Fix)
    if (connectPromise) {
        return connectPromise;
    }

    // 3) ابدأ الاتصال وحفظ الـ promise
    connectPromise = _doConnect().finally(() => {
        connectPromise = null; // امسح الـ promise بعد الانتهاء
    });

    return connectPromise;
};

async function _doConnect() {
    const isCloud = process.env.NODE_ENV === "production" || process.env.VERCEL || process.env.RENDER;

    // ── بيئة سحابة: اتصل مباشرة بـ Atlas ───────────────────────────────────
    if (isCloud) {
        if (!process.env.CONNECTDB_URL) {
            throw new Error("CONNECTDB_URL is not defined in environment variables!");
        }
        connectionState = "connecting";
        await connectTo(process.env.CONNECTDB_URL, "Atlas (Cloud)");
        connectionState = "connected";
        return;
    }

    // ── بيئة محلية: فحص الإنترنت أولاً ──────────────────────────────────────
    connectionState = "connecting";
    console.log("🔍 [DB] Checking internet connectivity...");

    const isOnline = await checkInternet();

    if (!isOnline) {
        console.warn("📴 [DB] No internet — connecting to local MongoDB...");
        const localUri = process.env.LOCAL_DB_URL || "mongodb://127.0.0.1:27017/tower";
        await connectTo(localUri, "Local MongoDB");
        connectionState = "local";
        return;
    }

    // ── إنترنت متاح: جرب Atlas أولاً ────────────────────────────────────────
    console.log("🌐 [DB] Internet available — connecting to Atlas...");
    if (!process.env.CONNECTDB_URL) {
        throw new Error("CONNECTDB_URL is not defined!");
    }

    try {
        await connectTo(process.env.CONNECTDB_URL, "Atlas (Primary)");
        connectionState = "connected";
    } catch (atlasErr) {
        // Atlas فشل → ارجع للمحلي
        console.error("❌ [DB] Atlas failed:", atlasErr.message);
        console.log("🔄 [DB] Falling back to local MongoDB...");
        const localUri = process.env.LOCAL_DB_URL || "mongodb://127.0.0.1:27017/tower";
        await connectTo(localUri, "Local MongoDB (Fallback)");
        connectionState = "local";
    }
}

module.exports = connectDB;