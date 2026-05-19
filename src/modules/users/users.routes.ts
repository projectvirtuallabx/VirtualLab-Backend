import { Router, Request } from "express";
import { requireAuth, AuthedRequest } from "../../middleware/auth.js";
import { prisma } from "../../config/prisma.js";

const router = Router();

router.get("/me", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  const user = await prisma.user.findUnique({
    where: { id: r.user!.sub },
    select: { id: true, email: true, name: true, createdAt: true },
  });

  res.json({ user });
});

export default router;