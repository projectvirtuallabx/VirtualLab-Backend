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
  duration: z.number().positive().max(4),
});

// helper to get shareId from the completed GENERATE_RDP task for a booking
async function getShareId(bookingId: string): Promise<string | null> {
  const tasks = await prisma.connectorTask.findMany({
    where: { type: "GENERATE_RDP" },
    orderBy: { createdAt: "desc" },
  });

  for (const task of tasks) {
    const p = task.payload as Record<string, unknown> | null;
    if (p && p["bookingId"] === bookingId) {
      return (task.result as any)?.shareId ?? null;
    }
  }
  return null;
}


// ================= GET USER BOOKINGS =================
router.get("/", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: r.user!.sub, status: { not: "CANCELLED" } },
      include: { user: { select: { email: true } } },
      orderBy: { start: "asc" },
    });

    res.json({
      bookings: bookings.map((b) => ({
        ...b,
        userId: b.user?.email || b.userId,
      })),
    });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    res.status(500).json({ 
      error: { code: "SERVER_ERROR", message: "Failed to fetch bookings" } 
    });
  }
});


// ================= GET ALL BOOKINGS =================
router.get("/all", requireAuth, async (req: Request, res) => {
  try {
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
  } catch (err) {
    console.error("Error fetching all bookings:", err);
    res.status(500).json({ 
      error: { code: "SERVER_ERROR", message: "Failed to fetch bookings" } 
    });
  }
});


// ================= GET SINGLE BOOKING =================
router.get("/:id", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;
  const id = String(r.params.id);

  try {
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
  } catch (err) {
    console.error("Error fetching booking:", err);
    res.status(500).json({ 
      error: { code: "SERVER_ERROR", message: "Failed to fetch booking" } 
    });
  }
});


// ================= DELETE MY BOOKINGS =================
router.delete("/mine", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  try {
    const myBookings = await prisma.booking.findMany({
      where: { userId: r.user!.sub, status: { not: "CANCELLED" } },
    });

    await prisma.booking.updateMany({
      where: { userId: r.user!.sub, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });

    for (const booking of myBookings) {
      const hw = await prisma.hardware.findFirst({ where: { name: booking.labName } });
      const nodeId = hw?.meshNodeId || env.DEFAULT_MESH_NODE_ID || "";
      const shareId = await getShareId(booking.id);

      const connectorPayload = {
        bookingId:       booking.id,
        userId:          booking.userId,
        userEmail:       r.user!.email,
        labName:         booking.labName,
        start:           booking.start.toISOString(),
        end:             booking.end.toISOString(),
        meshNodeId:      nodeId,
        durationMinutes: booking.duration * 60,
        shareId,
        taskType:        "BOOKING_DELETE",
      };

      await prisma.connectorTask.create({
        data: {
          type:    "BOOKING_DELETE",
          status:  "PENDING",
          payload: connectorPayload,
        },
      });

      addTask(connectorPayload);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting bookings:", err);
    res.status(500).json({ 
      error: { code: "SERVER_ERROR", message: "Failed to delete bookings" } 
    });
  }
});


// ================= DELETE SINGLE =================
router.delete("/:id", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;
  const id = String(r.params.id);

  try {
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

    const hw = await prisma.hardware.findFirst({ where: { name: booking.labName } });
    const nodeId = hw?.meshNodeId || env.DEFAULT_MESH_NODE_ID || "";
    const shareId = await getShareId(id);

    const connectorPayload = {
      bookingId:       booking.id,
      userId:          booking.userId,
      userEmail:       r.user!.email,
      labName:         booking.labName,
      start:           booking.start.toISOString(),
      end:             booking.end.toISOString(),
      meshNodeId:      nodeId,
      durationMinutes: booking.duration * 60,
      shareId,
      taskType:        "BOOKING_DELETE",
    };

    await prisma.connectorTask.create({
      data: {
        type:    "BOOKING_DELETE",
        status:  "PENDING",
        payload: connectorPayload,
      },
    });

    addTask(connectorPayload);

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting booking:", err);
    res.status(500).json({ 
      error: { code: "SERVER_ERROR", message: "Failed to delete booking" } 
    });
  }
});


// ================= CREATE BOOKING =================
router.post("/", requireAuth, async (req: Request, res) => {
  const r = req as AuthedRequest;

  try {
    // Validate request body
    const input = bookingSchema.parse(r.body);

    const start = new Date(input.start);
    const end = new Date(input.end);

    // Validation checks
    if (start.getTime() < Date.now()) {
      throw new AppError("Cannot book in the past", 400);
    }

    if (start.getTime() > Date.now() + 3 * 24 * 60 * 60 * 1000) {
      throw new AppError("Maximum 3 days advance booking allowed", 400);
    }

    // Duration should be between 0.25 hours (15 min) and 4 hours
    if (input.duration < 0.25 || input.duration > 4) {
      throw new AppError("Duration must be between 15 minutes and 4 hours", 400);
    }

    // Check for overlapping bookings
    const overlap = await prisma.booking.findFirst({
      where: {
        AND: [
          { start: { lt: end } },
          { end: { gt: start } },
          { status: { not: "CANCELLED" } },
        ],
      },
    });

    if (overlap) {
      throw new AppError("This time slot overlaps with an existing booking", 409);
    }

    // Create the booking
    const booking = await prisma.booking.create({
      data: {
        title:    input.title,
        labName:  input.labName,
        start,
        end,
        duration: input.duration,
        userId:   r.user!.sub,
        rdpLink:  null,
      },
    });

    const hw = await prisma.hardware.findFirst({
      where: { name: booking.labName },
    });

    const nodeId = hw?.meshNodeId || env.DEFAULT_MESH_NODE_ID || "";
    const durationMinutes = Math.round(input.duration * 60);

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
      return res.status(err.statusCode).json({ 
        message: err.message 
      });
    }

    if (err instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Invalid booking data",
        errors: err.errors
      });
    }

    return res.status(500).json({ 
      message: "Booking failed" 
    });
  }
});

export default router;
