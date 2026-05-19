import { prisma } from "../config/prisma.js";
export async function applyConnectorCallback(payload) {
    const resultRecord = {
        rdpLink: payload.rdpLink ?? null,
        shareId: payload.shareId ?? null,
        success: payload.success,
        error: payload.error ?? null,
        stdout: payload.stdout,
        stderr: payload.stderr,
        receivedAt: new Date().toISOString()
    };
    const taskStatus = payload.success ? "COMPLETED" : "FAILED";
    const booking = await prisma.booking.findUnique({
        where: { id: payload.bookingId }
    });
    if (!booking) {
        return { ok: false, reason: "BOOKING_NOT_FOUND" };
    }
    if (payload.rdpLink) {
        await prisma.booking.update({
            where: { id: payload.bookingId },
            data: { rdpLink: payload.rdpLink }
        });
    }
    if (payload.taskId) {
        await prisma.connectorTask.updateMany({
            where: { id: payload.taskId },
            data: {
                status: taskStatus,
                result: resultRecord,
                completedAt: new Date()
            }
        });
    }
    else {
        await prisma.connectorTask.updateMany({
            where: {
                status: { in: ["PENDING", "IN_PROGRESS"] },
                payload: { path: ["bookingId"], equals: payload.bookingId }
            },
            data: {
                status: taskStatus,
                result: resultRecord,
                completedAt: new Date()
            }
        });
    }
    await prisma.vmStatus.create({
        data: {
            vmId: payload.bookingId,
            bookingId: payload.bookingId,
            state: payload.success && payload.rdpLink ? "RDP_READY" : "RDP_FAILED",
            rdpLink: payload.rdpLink ?? null,
            metadata: payload.shareId ? { shareId: payload.shareId } : undefined
        }
    });
    const logMessage = payload.success
        ? payload.rdpLink
            ? `RDP link ready for booking ${payload.bookingId}`
            : `Connector reported success without rdpLink for booking ${payload.bookingId}`
        : `RDP generation failed for booking ${payload.bookingId}: ${payload.error ?? "unknown error"}`;
    await prisma.log.create({
        data: {
            bookingId: payload.bookingId,
            level: payload.success ? "info" : "error",
            source: "connector",
            message: logMessage
        }
    });
    return { ok: true, bookingId: payload.bookingId };
}
