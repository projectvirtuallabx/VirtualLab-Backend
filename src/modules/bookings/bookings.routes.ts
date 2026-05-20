import { Router, Request } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth, AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";
import { addTask } from "../connector/connector.routes.js";

const router = Router();

const bookingSchema = z.object({
  title: z.string().min(1),
  labName: z.string().min(1),
  start: z.string().datetime(),
  end: z.string().datetime(),
  duration: z.number().int().min(1).max(4),
});


// ================= GET USER BOOKINGS =================
router.get("/", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  const bookings = await prisma.booking.findMany({
    where: { userId: r.user!.sub },
    include: { user: { select: { email: true } } },
    orderBy: { start: "asc" },
  });

  res.json({
    bookings: bookings.map((b) => ({
      ...b,
      userId: b.user?.email || b.userId,
    })),
  });
});


// ================= GET ALL BOOKINGS =================
router.get("/all", requireAuth, async (req: Request, res) => {
  const bookings = await prisma.booking.findMany({
    where: { status: { not: "CANCELLED" } },
    include: { user: { select: { email: true } } },
    orderBy: { start: "asc" },
  });

  res.json({
    bookings: bookings.map((b) => ({
      ...b,
      userId: b.user?.email || b.userId,
    })),
  });
});


// ================= GET SINGLE BOOKING =================
router.get("/:id", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;
  const id = String(r.params.id);

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { user: { select: { email: true } } },
  });

  if (!booking) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Booking not found" },
    });
  }

  if (booking.userId !== r.user!.sub) {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
  }

  return res.json({
    booking: {
      ...booking,
      userId: booking.user?.email || booking.userId,
    },
    rdpReady: Boolean(booking.rdpLink),
  });
});


// ================= DELETE MY BOOKINGS =================
router.delete("/mine", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  await prisma.booking.updateMany({
    where: { userId: r.user!.sub, status: { not: "CANCELLED" } },
    data: { status: "CANCELLED" },
  });

  res.json({ success: true });
});


// ================= DELETE SINGLE =================
router.delete("/:id", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;
  const id = String(r.params.id);

  const booking = await prisma.booking.findUnique({ where: { id } });

  if (!booking) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Booking not found" },
    });
  }

  if (booking.userId !== r.user!.sub) {
    return res.status(403).json({
      error: { code: "FORBIDDEN", message: "Forbidden" },
    });
  }

  await prisma.booking.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  res.json({ success: true });
});


// ================= CREATE BOOKING =================
router.post("/", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  try {
    const input = bookingSchema.parse(r.body);

    const start = new Date(input.start);
    const end = new Date(input.end);

    if (start.getTime() < Date.now())
      throw new AppError("Cannot book in past", 400);

    if (start.getTime() > Date.now() + 3 * 24 * 60 * 60 * 1000)
      throw new AppError("Max 3 days advance booking", 400);

    if (input.duration > 3)
      throw new AppError("Max 3 consecutive slots", 400);

    const overlap = await prisma.booking.findFirst({
      where: {
        AND: [
          { start: { lt: end } },
          { end: { gt: start } },
          { status: { not: "CANCELLED" } },
        ],
      },
    });

    if (overlap) throw new AppError("Slot overlaps", 409);

    const booking = await prisma.booking.create({
      data: {
        title: input.title,
        labName: input.labName,
        start,
        end,
        duration: input.duration,
        userId: r.user!.sub,
        rdpLink: null,
      },
    });

    const hw = await prisma.hardware.findFirst({
      where: { name: booking.labName },
    });

    const nodeId = hw?.meshNodeId || env.DEFAULT_MESH_NODE_ID || "";

    // duration in minutes: booking duration in hours * 60, fallback to env, fallback to 60
    const durationMinutes = input.duration * 60;

    const connectorPayload = {
      bookingId:       booking.id,
      userId:          booking.userId,
      userEmail:       r.user!.email,
      labName:         booking.labName,
      start:           booking.start.toISOString(),
      end:             booking.end.toISOString(),
      meshNodeId:      nodeId,
      durationMinutes: durationMinutes,
      taskType:        "GENERATE_RDP",
    };

    await prisma.connectorTask.create({
      data: {
        type:    "GENERATE_RDP",
        status:  "PENDING",
        payload: connectorPayload,
      },
    });

    addTask(connectorPayload);

    return res.status(201).json({
      success:  true,
      booking,
      rdpReady: false,
      message:  "Booking confirmed. RDP link will be available shortly.",
    });
  } catch (err) {
    console.error("Booking error:", err);

    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ message: err.message });
    }

    return res.status(500).json({ message: "Booking failed" });
  }
});

export default router;
