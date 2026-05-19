import { Request } from "express";

export interface AuthedRequest extends Request {
  user?: {
    sub: string;
    email?: string;
    role?: string;
  };
  file?: Express.Multer.File;
}
