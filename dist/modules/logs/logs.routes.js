import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
const router = Router();
/* =======================
   GET LOGS
======================= */
router.get("/", requireAuth, async (_req, res) => {
    const logs = await prisma.log.findMany({
        orderBy: { createdAt: "desc" },
        take: 200
    });
    res.json({ logs });
});
/* =======================
   CREATE LOG
======================= */
router.post("/", requireAuth, async (req, res) => {
    const input = z.object({
        bookingId: z.string().optional(),
        level: z.string().default("info"),
        source: z.string().default("backend"),
        message: z.string().min(1)
    }).parse(req.body);
    // 🔥 FIX: bypass Prisma strict typing
    const log = await prisma.log.create({
        data: input
    });
    res.status(201).json({ log });
});
export default router;
