import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { requireConnectorAuth, requireConnectorBearer } from "../../middleware/auth.js";
import { applyConnectorCallback } from "../../services/connector-result.service.js";
const router = Router();
let taskQueue = [];
export const addTask = (task) => {
    taskQueue.push(task);
};
const RDP_TASK_TYPES = ["GENERATE_RDP", "BOOKING_CREATE"];
function publicBaseUrl(req) {
    return env.BACKEND_PUBLIC_URL ?? `${req.protocol}://${req.get("host")}`;
}
function formatPollTask(task, baseUrl) {
    const p = (task.payload ?? {});
    return {
        taskId: task.id,
        bookingId: p.bookingId,
        userEmail: p.userEmail,
        labName: p.labName,
        meshNodeId: p.meshNodeId,
        durationMinutes: p.durationMinutes,
        start: p.start,
        end: p.end,
        taskType: "GENERATE_RDP",
        callbackUrl: `${baseUrl}/connector/callback`
    };
}
async function claimNextDbTask(connectorId) {
    const task = await prisma.connectorTask.findFirst({
        where: {
            status: "PENDING",
            type: { in: [...RDP_TASK_TYPES] }
        },
        orderBy: { createdAt: "asc" }
    });
    if (!task)
        return null;
    await prisma.connectorTask.update({
        where: { id: task.id },
        data: { status: "IN_PROGRESS", assignedTo: connectorId }
    });
    return task;
}
const callbackSchema = z.object({
    bookingId: z.string().min(1),
    rdpLink: z.string().url().nullable().optional(),
    shareId: z.string().nullable().optional(),
    success: z.boolean(),
    error: z.string().nullable().optional(),
    stdout: z.string().optional(),
    stderr: z.string().optional(),
    taskId: z.string().optional()
});
// --- DB poll (Python connector: BACKEND_POLL_URL=/connector/poll) ---
router.get("/poll", requireConnectorBearer, async (req, res) => {
    const connectorId = String(req.query.connectorId ?? "default-connector");
    const baseUrl = publicBaseUrl(req);
    const task = await claimNextDbTask(connectorId);
    if (!task) {
        return res.json(null);
    }
    let formatted = formatPollTask(task, baseUrl);
    if (!formatted.userEmail && formatted.bookingId) {
        const booking = await prisma.booking.findUnique({
            where: { id: String(formatted.bookingId) },
            include: { user: { select: { email: true } } }
        });
        formatted = { ...formatted, userEmail: booking?.user?.email };
    }
    return res.json(formatted);
});
// Alias for older connector configs
router.get("/task", requireConnectorBearer, async (req, res) => {
    const connectorId = String(req.query.connectorId ?? "default-connector");
    const baseUrl = publicBaseUrl(req);
    const dbTask = await claimNextDbTask(connectorId);
    if (dbTask) {
        let formatted = formatPollTask(dbTask, baseUrl);
        if (!formatted.userEmail && formatted.bookingId) {
            const booking = await prisma.booking.findUnique({
                where: { id: String(formatted.bookingId) },
                include: { user: { select: { email: true } } }
            });
            formatted = { ...formatted, userEmail: booking?.user?.email };
        }
        return res.json(formatted);
    }
    if (taskQueue.length === 0) {
        return res.json(null);
    }
    const memTask = taskQueue.shift();
    return res.json({
        ...memTask,
        callbackUrl: memTask.callbackUrl ?? `${baseUrl}/connector/callback`,
        taskType: memTask.taskType ?? "GENERATE_RDP"
    });
});
router.post("/callback", requireConnectorBearer, async (req, res) => {
    const input = callbackSchema.parse(req.body);
    const outcome = await applyConnectorCallback({
        bookingId: input.bookingId,
        rdpLink: input.rdpLink,
        shareId: input.shareId,
        success: input.success,
        error: input.error,
        stdout: input.stdout,
        stderr: input.stderr,
        taskId: input.taskId
    });
    if (!outcome.ok) {
        return res.status(404).json({ success: false, error: outcome.reason });
    }
    return res.json({ success: true, bookingId: outcome.bookingId });
});
// --- Legacy x-connector-key routes ---
router.get("/tasks", requireConnectorAuth, async (req, res) => {
    const connectorId = String(req.query.connectorId ?? "default-connector");
    const baseUrl = publicBaseUrl(req);
    const tasks = await prisma.connectorTask.findMany({
        where: { status: "PENDING", type: { in: [...RDP_TASK_TYPES] } },
        orderBy: { createdAt: "asc" },
        take: 20
    });
    if (tasks.length > 0) {
        await prisma.connectorTask.updateMany({
            where: { id: { in: tasks.map((t) => t.id) }, status: "PENDING" },
            data: { status: "IN_PROGRESS", assignedTo: connectorId }
        });
    }
    res.json({
        tasks: tasks.map((t) => formatPollTask(t, baseUrl))
    });
});
router.post("/task-complete", requireConnectorAuth, async (req, res) => {
    const input = z
        .object({
        taskId: z.string(),
        success: z.boolean(),
        result: z.any().optional()
    })
        .parse(req.body);
    const task = await prisma.connectorTask.update({
        where: { id: input.taskId },
        data: {
            status: input.success ? "COMPLETED" : "FAILED",
            result: input.result,
            completedAt: new Date()
        }
    });
    res.json({ task });
});
router.post("/status-update", requireConnectorAuth, async (req, res) => {
    const input = z
        .object({
        vmId: z.string(),
        state: z.string(),
        hardwareId: z.string().optional(),
        bookingId: z.string().optional(),
        metadata: z.any().optional()
    })
        .parse(req.body);
    const vm = await prisma.vmStatus.create({
        data: {
            vmId: input.vmId,
            state: input.state,
            hardwareId: input.hardwareId,
            bookingId: input.bookingId,
            metadata: input.metadata
        }
    });
    res.json({ success: true, vm });
});
router.post("/rdp-link", requireConnectorAuth, async (req, res) => {
    const input = z
        .object({
        bookingId: z.string(),
        rdpLink: z.string().url(),
        shareId: z.string().optional(),
        vmId: z.string().optional()
    })
        .parse(req.body);
    await applyConnectorCallback({
        bookingId: input.bookingId,
        rdpLink: input.rdpLink,
        shareId: input.shareId,
        success: true
    });
    res.json({ success: true });
});
export default router;
