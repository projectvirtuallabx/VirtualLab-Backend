import "dotenv/config";
import app from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./config/prisma.js";
// ✅ Use Render PORT properly
const PORT = process.env.PORT || env.PORT || 5000;
// ✅ Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 VirtualLab backend running on port ${PORT}`);
});
// ✅ Graceful shutdown (important for Render)
const shutdown = async (signal) => {
    console.log(`\n⚠️ Received ${signal}. Shutting down...`);
    try {
        await prisma.$disconnect();
        console.log("✅ Prisma disconnected");
    }
    catch (err) {
        console.error("❌ Error during Prisma disconnect:", err);
    }
    server.close(() => {
        console.log("🛑 Server closed");
        process.exit(0);
    });
};
// ✅ Handle termination signals
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// ✅ Catch unexpected crashes (VERY IMPORTANT)
process.on("uncaughtException", (err) => {
    console.error("💥 Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
    console.error("💥 Unhandled Rejection:", reason);
});
