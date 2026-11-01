-- CreateTable
CREATE TABLE "quota_piles" (
    "id" TEXT NOT NULL,
    "debut" DATE NOT NULL,
    "boites_par_an" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_piles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quota_piles_debut_key" ON "quota_piles"("debut");

ALTER TABLE "quota_piles" ADD CONSTRAINT "quota_piles_positif" CHECK ("boites_par_an" >= 0);

-- Table globale, comme taux_tva : aucune ligne n'est posée, aucun texte de docs/ref ne fixe de quota (R15).
GRANT SELECT ON "quota_piles" TO ha_app;
GRANT SELECT, INSERT ON "quota_piles" TO ha_plateforme;
