-- CreateTable
CREATE TABLE "ECDHS" (
    "address1" TEXT NOT NULL,
    "address2" TEXT NOT NULL,
    "partition" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "json1" TEXT NOT NULL,
    "json2" TEXT NOT NULL,

    CONSTRAINT "ECDHS_pkey" PRIMARY KEY ("address1","address2","partition","sequence")
);

-- CreateTable
CREATE TABLE "MESSAGES" (
    "hash" TEXT NOT NULL,
    "sour_address" TEXT NOT NULL,
    "dest_address" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "signed_at" BIGINT NOT NULL,
    "json" TEXT NOT NULL,

    CONSTRAINT "MESSAGES_pkey" PRIMARY KEY ("hash")
);
