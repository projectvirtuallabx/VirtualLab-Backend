import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
const router = Router();
router.get("/", async (_req, res) => {
    const hardware = await prisma.hardware.findMany({ orderBy: { name: "asc" } });
    res.json({ hardware });
});
router.post("/", requireAuth, async (req, res) => {
    const input = z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        vmTemplate: z.string().optional(),
        meshNodeId: z.string().optional()
    }).parse(req.body);
    const item = await prisma.hardware.create({ data: req.body });
    res.status(201).json({ hardware: item });
});
export default router;
