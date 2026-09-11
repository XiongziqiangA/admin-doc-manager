import { AssetExitType } from "@prisma/client";

export function assetStatusForExit(exitType: AssetExitType) {
  const statuses: Record<AssetExitType, string> = {
    SCRAPPED: "scrapped",
    LOST: "lost",
    SOLD: "sold",
    TRANSFERRED: "transferred",
    DONATED: "donated",
    CROSS_COMPANY_TRANSFER: "transferred",
  };
  return statuses[exitType];
}
