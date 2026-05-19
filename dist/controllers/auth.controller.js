import { z } from "zod";
import { authService } from "../services/auth.service.js";
/* =======================
   ZOD SCHEMAS
======================= */
const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().optional()
});
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
});
/* =======================
   CONTROLLER
======================= */
export const authController = {
    async register(req, res) {
        const input = registerSchema.parse(req.body);
        const user = await authService.register(input);
        return res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    },
    async login(req, res) {
        const input = loginSchema.parse(req.body);
        const { user, token } = await authService.login(input);
        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    },
    async frontendCompatLogin(req, res) {
        const { email, name } = req.body;
        const user = await authService.registerOrGetDemoUser(email, name || email.split("@")[0]);
        const token = authService.signToken(user);
        return res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                name: user.name
            }
        });
    },
    async me(req, res) {
        if (!req.user) {
            return res.status(200).json({ user: null });
        }
        return res.json({
            user: {
                id: req.user.sub,
                email: req.user.email,
                name: req.user.name
            }
        });
    },
    async forgotPassword(req, res) {
        const { email } = req.body;
        const result = await authService.requestReset(email);
        return res.json({
            success: true,
            ...(process.env.NODE_ENV !== "production"
                ? { resetToken: result.token }
                : {})
        });
    },
    async resetPassword(req, res) {
        const { token, password } = req.body;
        await authService.resetPassword(token, password);
        return res.json({ success: true });
    },
    logout(_req, res) {
        return res.json({ success: true });
    }
};
