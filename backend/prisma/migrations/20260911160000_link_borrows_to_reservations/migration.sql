ALTER TYPE "AssetReservationStatus" ADD VALUE 'COMPLETED' AFTER 'ACTIVE';

ALTER TABLE "asset_borrow_records" ADD COLUMN "reservation_id" TEXT;

CREATE UNIQUE INDEX "asset_borrow_records_reservation_id_key" ON "asset_borrow_records"("reservation_id");
CREATE INDEX "asset_borrow_records_reservation_id_idx" ON "asset_borrow_records"("reservation_id");

ALTER TABLE "asset_borrow_records"
  ADD CONSTRAINT "asset_borrow_records_reservation_id_fkey"
  FOREIGN KEY ("reservation_id") REFERENCES "asset_reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
