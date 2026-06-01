import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import cors from "cors";
import { prisma } from "../../config/prisma.js";
import { requireAuth, AuthedRequest } from "../../middleware/auth.js";
import { AppError } from "../../middleware/errorHandler.js";
import { env } from "../../config/env.js";
import { addTask } from "../connector/connector.routes.js";

const router = Router();

// ✅ CORS Configuration for bookings routes
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "http://localhost:5173",
    "https://virtuallabx.com/",
    "https://virtual-lab-21725.web.app",
    process.env.FRONTEND_URL || ""
  ].filter(Boolean),
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 200,
  maxAge: 86400,
};

// ✅ Apply CORS to all bookings routes
router.use(cors(corsOptions));

// ✅ Explicit OPTIONS handler
router.options("*", cors(corsOptions));

const bookingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  labName: z.string().min(1, "Lab name is required"),
  start: z.string().datetime("Invalid start date format"),
  end: z.string().datetime("Invalid end date format"),
  duration: z.number().positive("Duration must be positive").max(4, "Max 4 hours"),
});

// helper to get shareId from the completed GENERATE_RDP task for a booking
async function getShareId(bookingId: string): Promise<string | null> {
  try {
    const tasks = await prisma.connectorTask.findMany({
      where: { type: "GENERATE_RDP" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    for (const task of tasks) {
      const p = task.payload as Record<string, unknown> | null;
      if (p && p["bookingId"] === bookingId) {
        return (task.result as any)?.shareId ?? null;
      }
    }
    return null;
  } catch (err) {
    console.error("Error getting share ID:", err);
    return null;
  }
}


// ================= GET USER BOOKINGS =================
router.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = req as AuthedRequest;

    const bookings = await prisma.booking.findMany({
      where: { userId: r.user!.sub, status: { not: "CANCELLED" } },
      include: { user: { select: { email: true } } },
      orderBy: { start: "asc" },
    });

    res.status(200).json({
      success: true,
      bookings: bookings.map((b) => ({
        ...b,
        userId: b.user?.email || b.userId,
      })),
    });
  } catch (err) {
    console.error("Error fetching bookings:", err);
    next(err);
  }
});


// ================= GET ALL BOOKINGS =================
router.get("/all", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { status: { not: "CANCELLED" } },
      include: { user: { select: { email: true } } },
      orderBy: { start: "asc" },
    });

    res.status(200).json({
      success: true,
      bookings: bookings.map((b) => ({
        ...b,
        userId: b.user?.email || b.userId,
      })),
    });
  } catch (err) {
    console.error("Error fetching all bookings:", err);
    next(err);
  }
});


// ================= GET SINGLE BOOKING =================
router.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
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

    return res.status(200).json({
      success: true,
      booking: {
        ...booking,
        userId: booking.user?.email || booking.userId,
      },
      rdpReady: Boolean(booking.rdpLink),
    });
  } catch (err) {
    console.error("Error fetching booking:", err);
    next(err);
  }
});


// ================= DELETE MY BOOKINGS =================
router.delete("/mine", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = req as AuthedRequest;

    const myBookings = await prisma.booking.findMany({
      where: { userId: r.user!.sub, status: { not: "CANCELLED" } },
    });

    await prisma.booking.updateMany({
      where: { userId: r.user!.sub, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });

    for (const booking of myBookings) {
      const hw = await prisma.hardware.findFirst({
        where: { name: booking.labName },
      });
      const nodeId = hw?.meshNodeId || env.DEFAULT_MESH_NODE_ID || "";
      const shareId = await getShareId(booking.id);

      const connectorPayload = {
        bookingId: booking.id,
        userId: booking.userId,
        userEmail: r.user!.email,
        labName: booking.labName,
        start: booking.start.toISOString(),
        end: booking.end.toISOString(),
        meshNodeId: nodeId,
        durationMinutes: booking.duration * 60,
        shareId,
        taskType: "BOOKING_DELETE",
      };

      await prisma.connectorTask.create({
        data: {
          type: "BOOKING_DELETE",
          status: "PENDING",
          payload: connectorPayload,
        },
      });

      addTask(connectorPayload);
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error deleting bookings:", err);
    next(err);
  }
});


// ================= DELETE SINGLE BOOKING =================
router.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
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

    const hw = await prisma.hardware.findFirst({
      where: { name: booking.labName },
    });
    const nodeId = hw?.meshNodeId || env.DEFAULT_MESH_NODE_ID || "";
    const shareId = await getShareId(id);

    const connectorPayload = {
      bookingId: booking.id,
      userId: booking.userId,
      userEmail: r.user!.email,
      labName: booking.labName,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
      meshNodeId: nodeId,
      durationMinutes: booking.duration * 60,
      shareId,
      taskType: "BOOKING_DELETE",
    };

    await prisma.connectorTask.create({
      data: {
        type: "BOOKING_DELETE",
        status: "PENDING",
        payload: connectorPayload,
      },
    });

    addTask(connectorPayload);

    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Error deleting booking:", err);
    next(err);
  }
});


// ================= CREATE BOOKING =================
router.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const r = req as AuthedRequest;

    console.log("Booking request body:", r.body);

    // Validate input
    const input = bookingSchema.parse(r.body);

    const start = new Date(input.start);
    const end = new Date(input.end);

    // Validation: can't book in past
    if (start.getTime() < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "Cannot book in the past",
      });
    }

    // Validation: max 3 days advance
    if (start.getTime() > Date.now() + 3 * 24 * 60 * 60 * 1000) {
      return res.status(400).json({
        success: false,
        message: "Maximum 3 days advance booking allowed",
      });
    }

    // Validation: duration between 15 min and 4 hours
    if (input.duration < 0.25 || input.duration > 4) {
      return res.status(400).json({
        success: false,
        message: "Duration must be between 15 minutes and 4 hours",
      });
    }

    // Check overlapping bookings
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
      return res.status(409).json({
        success: false,
        message: "This time slot overlaps with an existing booking",
      });
    }

    // Create booking
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
    const durationMinutes = Math.round(input.duration * 60);

    const connectorPayload = {
      bookingId: booking.id,
      userId: booking.userId,
      userEmail: r.user!.email,
      labName: booking.labName,
      start: booking.start.toISOString(),
      end: booking.end.toISOString(),
      meshNodeId: nodeId,
      durationMinutes: durationMinutes,
      taskType: "GENERATE_RDP",
    };

    await prisma.connectorTask.create({
      data: {
        type: "GENERATE_RDP",
        status: "PENDING",
        payload: connectorPayload,
      },
    });

    addTask(connectorPayload);

    return res.status(201).json({
      success: true,
      booking,
      rdpReady: false,
      message: "Booking confirmed. RDP link will be available shortly.",
    });
  } catch (err) {
    console.error("Booking error:", err);

    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking data",
        errors: err.errors,
      });
    }

    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        success: false,
        message: err.message,
      });
    }

    next(err);
  }
});

export default router;
