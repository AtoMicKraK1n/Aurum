import { Request, Response } from "express";
import { ApiResponse } from "../../types";
import { getPurchaseOperatingMode } from "../../lib/purchase-mode";

export async function getPurchaseConfig(
  _req: Request,
  res: Response<
    ApiResponse<{
      operatingMode: "custodial" | "self_custody";
      selfCustodyEnabled: boolean;
    }>
  >,
): Promise<void> {
  const operatingMode = getPurchaseOperatingMode();
  res.json({
    success: true,
    data: {
      operatingMode,
      selfCustodyEnabled: operatingMode === "self_custody",
    },
  });
}
