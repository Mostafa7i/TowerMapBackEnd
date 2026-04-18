const mongoose = require("mongoose");
const net = require("net");

const checkInternet = () => {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1500); 
        
        socket.on("connect", () => {
            socket.destroy();
            resolve(true);
        });
        
        socket.on("timeout", () => {
            socket.destroy();
            resolve(false); 
        });
        
        socket.on("error", () => {
            socket.destroy();
            resolve(false); 
        });
        
        socket.connect(53, "8.8.8.8");
    });
};

let usingLocalDB = false;

const triggerLocalFallback = async () => {
    if (usingLocalDB) return; // منع التكرار إذا كنا أصلاً على المحلي
    const isCloudDeployed = process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.RENDER;
    if (isCloudDeployed) return;
    
    usingLocalDB = true;
    console.log("⚠️ Connection to primary DB dropped! Triggering instant local fallback...");
    try {
        await mongoose.disconnect(); // إغلاق تام لأي اتصالات معلقة
        const localDbUrl = process.env.LOCAL_DB_URL || "mongodb://127.0.0.1:27017/tower";
        await mongoose.connect(localDbUrl, { serverSelectionTimeoutMS: 5000 });
        console.log(`Connected to local fallback database successfully 🟡🟡🟡`);
    } catch (e) {
        console.error("Failed to fall back to local DB", e);
    }
};

// الاستماع الدائم لانقطاع الاتصال أو الأخطاء لتفعيل الاحتياط التلقائي في أي وقت
mongoose.connection.on('error', (err) => {
    if (!usingLocalDB) {
        console.error("Mongoose connection error detected:", err.message);
        triggerLocalFallback();
    }
});

mongoose.connection.on('disconnected', () => {
    if (!usingLocalDB) {
        console.log("Mongoose disconnected unexpectedly.");
        triggerLocalFallback();
    }
});

const connectDB = async() =>{
    try {
        console.log("DB URL exists:", !!process.env.CONNECTDB_URL);
        
        console.log("Checking internet connectivity securely...");
        const isOnline = await checkInternet();
        const isCloudDeployed = process.env.NODE_ENV === 'production' || process.env.VERCEL || process.env.RENDER;
        
        if (!isOnline && !isCloudDeployed) {
            console.log("No true internet connection detected! Instantly falling back to local database...");
            usingLocalDB = true;
            const localDbUrl = process.env.LOCAL_DB_URL || "mongodb://127.0.0.1:27017/tower";
            await mongoose.connect(localDbUrl);
            console.log(`Connected to local fallback database successfully 🟡🟡🟡`);
            return;
        }

        console.log("Internet verified. Attempting to connect to primary database...");
        await mongoose.connect(process.env.CONNECTDB_URL, {
            serverSelectionTimeoutMS: 5000 // 5 seconds timeout
        });
        console.log(`The primary database is connected successfully 🟢🟢🟢`);
        
    } catch (error) {
        console.error(`Error connecting to primary DB, attempting local fallback... >> ${error.message}`);
        usingLocalDB = false; // Reset to allow triggerLocalFallback to work
        triggerLocalFallback();
    }
}
module.exports = connectDB;