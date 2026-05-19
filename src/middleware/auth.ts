import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;

export type AuthedRequest = Request & {
  user?: {
    sub: string;
    email: string;
    role?: string;
  };
};

export const requireAuth = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, JWT_SECRET);
    if (typeof decoded === "object" && decoded !== null && "sub" in decoded) {
      (req as AuthedRequest).user = {
        sub: (decoded as any).sub,
        email: (decoded as any).email,
        role: (decoded as any).role,
      };
    } else {
      return res.status(401).json({ message: "Invalid token payload" });
    }

    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export const optionalAuth = (req: any, _res: any, next: any) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET!);
      if (typeof decoded === "object" && decoded !== null && "sub" in decoded) {
        req.user = {
          sub: (decoded as any).sub,
          email: (decoded as any).email,
          role: (decoded as any).role,
        };
      }
    }
  } catch (err) {
    // ignore errors → optional
  }
  next();
};

export const requireConnectorAuth = (req: any, res: any, next: any) => {
  const key = req.headers["x-connector-key"];
  const expected =
    process.env.CONNECTOR_KEY ||
    process.env.CONNECTOR_API_KEY ||
    "dev-connector-key";
  if (!key || key !== expected) {
    return res.status(401).json({ message: "Unauthorized connector" });
  }
  next();
};

export const requireConnectorBearer = (req: any, res: any, next: any) => {
  const auth = req.headers.authorization;
  const expected =
    process.env.CONNECTOR_SECRET_TOKEN ||
    process.env.SECRET_TOKEN ||
    process.env.CONNECTOR_API_KEY;

  if (!expected) {
    return res.status(503).json({ message: "Connector auth not configured" });
  }

  if (auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};