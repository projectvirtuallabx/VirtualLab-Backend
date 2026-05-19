import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(1),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  UPLOAD_DIR: z.string().default("uploads"),
  CONNECTOR_API_KEY: z.string().default("dev-connector-key"),
  CONNECTOR_SECRET_TOKEN: z.string().optional(),
  SECRET_TOKEN: z.string().optional(),
  BACKEND_PUBLIC_URL: z.string().url().optional(),
  MESHCTRL_PATH: z.string().default("meshctrl"),
  DEFAULT_MESH_NODE_ID: z.string().optional(),
  MESH_RDP_DURATION_MINUTES: z.coerce.number().int().positive().default(60)
});

export const env = envSchema.parse(process.env);
