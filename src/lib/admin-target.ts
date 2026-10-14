import { User, isObjectId, type UserDoc } from "./models";
import { Errors } from "./errors";

/** Loads the user an admin is acting on. Admin identity itself always comes from the session. */
export async function loadTargetUser(id: unknown): Promise<UserDoc> {
  if (!isObjectId(id)) throw Errors.notFound("User");
  const u = await User.findById(id).lean<UserDoc>();
  if (!u) throw Errors.notFound("User");
  return u;
}
