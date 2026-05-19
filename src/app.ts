import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { env } from "./config/env.js";
import { optionalAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

import authRoutes from "./modules/auth/auth.routes.js";
import usersRoutes from "./modules/users/users.routes.js";
import hardwareRoutes from "./modules/hardware/hardware.routes.js";
import bookingsRoutes from "./modules/bookings/bookings.routes.js";
import projectsRoutes from "./modules/projects/projects.routes.js";
import uploadsRoutes from "./modules/uploads/uploads.routes.js";
import connectorRoutes from "./modules/connector/connector.routes.js";
import vmRoutes from "./modules/vm/vm.routes.js";
import logsRoutes from "./modules/logs/logs.routes.js";
import compatibilityRoutes from "./modules/compatibility/compatibility.routes.js";


const app = express();

const uploadDir = path.resolve(process.cwd(), env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

app.use(helmet());

const allowedOrigins = [
  "https://virtuallabx.com",
  "https://www.virtuallabx.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:4173",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, origin);
      } else {
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-connector-key"],
  })
);

// Handle preflight requests for all routes
app.options("*", cors());

app.set("trust proxy", 1);
app.use(morgan("dev"));
app.use(cookieParser());
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/files", express.static(uploadDir));
app.use(optionalAuth);

// Health check route
app.get("/", (_req, res) => {
  res.status(200).json({ message: "Backend is running" });
});

app.get("/api/test", (_req, res) => {
  res.json({ ok: true });
});

app.use("/", compatibilityRoutes);

app.use("/auth", authRoutes);
app.use("/users", usersRoutes);
app.use("/hardware", hardwareRoutes);
app.use("/bookings", bookingsRoutes);
app.use("/projects", projectsRoutes);
app.use("/uploads", uploadsRoutes);
app.use("/connector", connectorRoutes);
app.use("/vm", vmRoutes);
app.use("/logs", logsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;