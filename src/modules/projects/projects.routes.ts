import { Router, Request } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth, AuthedRequest } from "../../middleware/auth.js";

const router = Router();

/* =======================
   GET PROJECTS
======================= */
router.get("/", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  const projects = await prisma.project.findMany({
    where: { userId: r.user!.sub },
    include: { files: true },
    orderBy: { createdAt: "desc" },
  });

  res.json({ projects });
});

/* =======================
   CREATE PROJECT
======================= */
router.post("/", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  const input = z.object({
    projectName: z.string().min(1),
    controls: z.array(z.string()).default([]),
    sensors: z.string().optional(),
    expectedOutput: z.string().optional(),
    platform: z.string().optional(),
    hardwareId: z.string().optional(),
  }).parse(r.body);

  const project = await prisma.project.create({
    data: {
      ...input,
      userId: r.user!.sub,
    } as any,
  });

  res.status(201).json({ project });
});

export default router;