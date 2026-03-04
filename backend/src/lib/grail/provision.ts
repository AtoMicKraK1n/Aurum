import { User } from "../../types";
import { db } from "../../db/queries";
import { registerGrailUser } from "./user";

export type GrailProvisionResult =
  | {
      status: "existing" | "created";
      user: User;
    }
  | {
      status: "failed";
      user: User;
      error: string;
    };

export async function ensureGrailProvisionedUser(
  user: User,
): Promise<GrailProvisionResult> {
  if (user.grail_user_id) {
    return { status: "existing", user };
  }

  try {
    const { userId, userPda } = await registerGrailUser(user.wallet_address);
    await db.updateGrailUser(user.id, userId, userPda);

    return {
      status: "created",
      user: {
        ...user,
        grail_user_id: userId,
        grail_user_pda: userPda,
      },
    };
  } catch (error) {
    return {
      status: "failed",
      user,
      error:
        error instanceof Error && error.message
          ? error.message
          : "Unknown GRAIL provisioning error",
    };
  }
}
