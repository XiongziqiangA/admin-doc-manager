import { Request } from "express";

import { PublicUser } from "../users/user.presenter";

export interface AuthenticatedRequest extends Request {
  user?: PublicUser;
}
