-- CreateTable
CREATE TABLE "BULLETINS" (
    "hash" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "json" TEXT NOT NULL,
    "signed_at" BIGINT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "pre_hash" TEXT,
    "next_hash" TEXT,

    CONSTRAINT "BULLETINS_pkey" PRIMARY KEY ("hash")
);

-- CreateTable
CREATE TABLE "QUOTES" (
    "main_hash" TEXT NOT NULL,
    "quote_hash" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "signed_at" BIGINT NOT NULL,

    CONSTRAINT "QUOTES_pkey" PRIMARY KEY ("main_hash","quote_hash")
);
