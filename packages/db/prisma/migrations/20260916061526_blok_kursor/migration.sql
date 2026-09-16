-- CreateTable
CREATE TABLE "block_cursors" (
    "chain" TEXT NOT NULL,
    "last_final_block" INTEGER,
    "missing_ranges" JSONB NOT NULL DEFAULT '[]',
    "backfilled_to_block" INTEGER,
    "last_error" TEXT,
    "last_run_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "block_cursors_pkey" PRIMARY KEY ("chain")
);
