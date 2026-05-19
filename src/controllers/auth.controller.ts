import { Request, Response } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service.js";

/* =======================
   ZOD SCHEMAS
======================= */

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/* =======================
   TYPES
======================= */

type RegisterInput = z.infer<typeof registerSchema>;
type LoginInput = z.infer<typeof loginSchema>;

type AuthedRequest = Request & {
  user?: {
    sub: string;
    email: string;
    name: string;
  };
};

/* =======================
   CONTROLLER
======================= */

export const authController = {
  async register(req: Request, res: Response) {
    const input = registerSchema.parse(req.body) as RegisterInput;

    const user = await authService.register(input as any);

    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  },

  async login(req: Request, res: Response) {
    const input = loginSchema.parse(req.body) as LoginInput;

    const { user, token } = await authService.login(input as any);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  },

  async frontendCompatLogin(req: Request, res: Response) {
    const { email, name } = req.body as { email: string; name?: string };

    const user = await authService.registerOrGetDemoUser(
      email,
      name || email.split("@")[0]
    );

    const token = authService.signToken(user);

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  },

  async me(req: Request, res: Response) {
    const r = req as AuthedRequest;

    if (!r.user) {
      return res.status(200).json({ user: null });
    }

    return res.json({
      user: {
        id: r.user.sub,
        email: r.user.email,
        name: r.user.name,
      },
    });
  },

  async forgotPassword(req: Request, res: Response) {
    const { email } = req.body as { email: string };

    const result = await authService.requestReset(email);

    return res.json({
      success: true,
      ...(process.env.NODE_ENV !== "production"
        ? { resetToken: result.token }
        : {}),
    });
  },

  async resetPassword(req: Request, res: Response) {
    const { token, password } = req.body as {
      token: string;
      password: string;
    };

    await authService.resetPassword(token, password);

    return res.json({ success: true });
  },

  logout(_req: Request, res: Response) {
    return res.json({ success: true });
  },
};