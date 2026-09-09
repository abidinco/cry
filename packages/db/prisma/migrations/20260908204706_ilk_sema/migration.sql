-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "role_id" INTEGER NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" SERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "contract" TEXT NOT NULL DEFAULT '',
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "name" TEXT,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" BIGSERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "first_seen" TIMESTAMP(3),
    "last_seen" TIMESTAMP(3),
    "balance_raw" TEXT,
    "is_contract" BOOLEAN DEFAULT false,
    "indexed_through_block" INTEGER,
    "indexed_through_ts" TIMESTAMP(3),
    "index_cursor" TEXT,
    "last_indexed_at" TIMESTAMP(3),
    "index_state" TEXT NOT NULL DEFAULT 'bilinmiyor',
    "activated_by_address" TEXT,
    "activated_at" TIMESTAMP(3),
    "activation_tx_hash" TEXT,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" BIGSERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "block_number" INTEGER,
    "ts" TIMESTAMP(3) NOT NULL,
    "from_address_id" BIGINT,
    "to_address_id" BIGINT,
    "asset_id" INTEGER NOT NULL,
    "amount_raw" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "fee_raw" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "probe_cache" (
    "id" BIGSERIAL NOT NULL,
    "input" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "probed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "probe_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" SERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "address_id" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "exchange" TEXT,
    "source" TEXT NOT NULL,
    "source_url" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "verified_by" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "approved_at" TIMESTAMP(3),
    "approved_by_id" INTEGER,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidence" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_candidates" (
    "id" BIGSERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "deposit_address" TEXT NOT NULL,
    "hot_wallet_address" TEXT NOT NULL,
    "exchange" TEXT,
    "evidence" JSONB NOT NULL DEFAULT '{}',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'aday',
    "reviewed_by_id" INTEGER,
    "reviewed_at" TIMESTAMP(3),
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "owner_id" INTEGER NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_notes" (
    "id" SERIAL NOT NULL,
    "case_id" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_queries" (
    "id" BIGSERIAL NOT NULL,
    "case_id" INTEGER NOT NULL,
    "raw_input" TEXT NOT NULL,
    "detection" JSONB NOT NULL,
    "chain" TEXT,
    "resolved" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_runs" (
    "id" BIGSERIAL NOT NULL,
    "case_id" INTEGER NOT NULL,
    "chain" TEXT NOT NULL,
    "root_address" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ileri',
    "taint_rule" TEXT NOT NULL,
    "params" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'kuyrukta',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "stop_reason" TEXT,
    "stats" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "trace_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_nodes" (
    "id" BIGSERIAL NOT NULL,
    "trace_run_id" BIGINT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "hop" INTEGER NOT NULL,
    "taint_share" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount_raw" TEXT,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "terminal_reason" TEXT,
    "label_snapshot" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "trace_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trace_edges" (
    "id" BIGSERIAL NOT NULL,
    "trace_run_id" BIGINT NOT NULL,
    "chain" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "tx_index" INTEGER NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_address" TEXT NOT NULL,
    "asset_symbol" TEXT NOT NULL,
    "asset_contract" TEXT,
    "decimals" INTEGER NOT NULL,
    "amount_raw" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "hop" INTEGER NOT NULL,
    "taint_share" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "trace_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" BIGSERIAL NOT NULL,
    "case_id" INTEGER NOT NULL,
    "trace_run_id" BIGINT,
    "title" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "columns" JSONB NOT NULL DEFAULT '[]',
    "sha256" TEXT NOT NULL,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prices_daily" (
    "id" BIGSERIAL NOT NULL,
    "asset_id" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "usd" DECIMAL(38,12) NOT NULL,
    "source" TEXT NOT NULL,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prices_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates_daily" (
    "date" DATE NOT NULL,
    "usd_try" DECIMAL(18,6) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'tcmb',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_daily_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "watches" (
    "id" SERIAL NOT NULL,
    "chain" TEXT NOT NULL,
    "address_id" BIGINT NOT NULL,
    "case_id" INTEGER,
    "label" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_tx_hash" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" BIGSERIAL NOT NULL,
    "watch_id" INTEGER NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "amount_raw" TEXT,
    "asset_symbol" TEXT,
    "direction" TEXT,
    "sent_at" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'telegram',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "assets_chain_symbol_idx" ON "assets"("chain", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "assets_chain_contract_key" ON "assets"("chain", "contract");

-- CreateIndex
CREATE INDEX "addresses_chain_activated_by_address_idx" ON "addresses"("chain", "activated_by_address");

-- CreateIndex
CREATE UNIQUE INDEX "addresses_chain_address_key" ON "addresses"("chain", "address");

-- CreateIndex
CREATE INDEX "transfers_from_address_id_ts_idx" ON "transfers"("from_address_id", "ts");

-- CreateIndex
CREATE INDEX "transfers_to_address_id_ts_idx" ON "transfers"("to_address_id", "ts");

-- CreateIndex
CREATE INDEX "transfers_chain_ts_idx" ON "transfers"("chain", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_chain_tx_hash_index_key" ON "transfers"("chain", "tx_hash", "index");

-- CreateIndex
CREATE UNIQUE INDEX "probe_cache_input_key" ON "probe_cache"("input");

-- CreateIndex
CREATE INDEX "labels_address_id_idx" ON "labels"("address_id");

-- CreateIndex
CREATE INDEX "labels_category_exchange_idx" ON "labels"("category", "exchange");

-- CreateIndex
CREATE INDEX "deposit_candidates_exchange_status_idx" ON "deposit_candidates"("exchange", "status");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_candidates_chain_deposit_address_hot_wallet_address_key" ON "deposit_candidates"("chain", "deposit_address", "hot_wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "cases_slug_key" ON "cases"("slug");

-- CreateIndex
CREATE INDEX "case_notes_case_id_created_at_idx" ON "case_notes"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "case_queries_case_id_created_at_idx" ON "case_queries"("case_id", "created_at");

-- CreateIndex
CREATE INDEX "trace_runs_case_id_started_at_idx" ON "trace_runs"("case_id", "started_at");

-- CreateIndex
CREATE INDEX "trace_nodes_trace_run_id_hop_idx" ON "trace_nodes"("trace_run_id", "hop");

-- CreateIndex
CREATE UNIQUE INDEX "trace_nodes_trace_run_id_chain_address_key" ON "trace_nodes"("trace_run_id", "chain", "address");

-- CreateIndex
CREATE INDEX "trace_edges_trace_run_id_hop_idx" ON "trace_edges"("trace_run_id", "hop");

-- CreateIndex
CREATE INDEX "trace_edges_trace_run_id_ts_idx" ON "trace_edges"("trace_run_id", "ts");

-- CreateIndex
CREATE INDEX "reports_case_id_created_at_idx" ON "reports"("case_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "prices_daily_asset_id_date_key" ON "prices_daily"("asset_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "watches_chain_address_id_key" ON "watches"("chain", "address_id");

-- CreateIndex
CREATE INDEX "alerts_watch_id_created_at_idx" ON "alerts"("watch_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "alerts_watch_id_tx_hash_key" ON "alerts"("watch_id", "tx_hash");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_address_id_fkey" FOREIGN KEY ("from_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_address_id_fkey" FOREIGN KEY ("to_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_notes" ADD CONSTRAINT "case_notes_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_queries" ADD CONSTRAINT "case_queries_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_runs" ADD CONSTRAINT "trace_runs_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_nodes" ADD CONSTRAINT "trace_nodes_trace_run_id_fkey" FOREIGN KEY ("trace_run_id") REFERENCES "trace_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trace_edges" ADD CONSTRAINT "trace_edges_trace_run_id_fkey" FOREIGN KEY ("trace_run_id") REFERENCES "trace_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_trace_run_id_fkey" FOREIGN KEY ("trace_run_id") REFERENCES "trace_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prices_daily" ADD CONSTRAINT "prices_daily_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watches" ADD CONSTRAINT "watches_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watches" ADD CONSTRAINT "watches_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_watch_id_fkey" FOREIGN KEY ("watch_id") REFERENCES "watches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
