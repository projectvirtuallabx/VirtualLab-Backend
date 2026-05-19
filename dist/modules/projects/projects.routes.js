import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
const router = Router();
/* =======================
   GET PROJECTS
======================= */
router.get("/", requireAuth, async (req, res) => {
    const projects = await prisma.project.findMany({
        where: { userId: req.user.sub },
        include: { files: true },
        orderBy: { createdAt: "desc" }
    });
    res.json({ projects });
});
/* =======================
   CREATE PROJECT
======================= */
router.post("/", requireAuth, async (req, res) => {
    const input = z.object({
        projectName: z.string().min(1),
        controls: z.array(z.string()).default([]),
        sensors: z.string().optional(),
        expectedOutput: z.string().optional(),
        platform: z.string().optional(),
        hardwareId: z.string().optional()
    }).parse(req.body);
    // 🔥 FIX: bypass Prisma strict typing
    const project = await prisma.project.create({
        data: {
            ...input,
            userId: req.user.sub
        }
    });
    res.status(201).json({ project });
});
export default router;
