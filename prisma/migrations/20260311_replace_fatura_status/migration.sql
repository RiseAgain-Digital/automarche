-- Drop default first
ALTER TABLE "Fatura" ALTER COLUMN "status" DROP DEFAULT;

-- Convert to TEXT temporarily
ALTER TABLE "Fatura" ALTER COLUMN "status" TYPE TEXT;

-- Drop old enum
DROP TYPE "FaturaStatus";

-- Create new enum
CREATE TYPE "FaturaStatus" AS ENUM ('RECEBIDO', 'EM_PICAGEM', 'BLOQUEADO', 'EM_VALORIZACAO', 'DIVERGENCIA', 'VALIDADO');

-- Migrate existing data (map old values to closest new ones)
UPDATE "Fatura" SET "status" = 'RECEBIDO' WHERE "status" IN ('PENDENTE');
UPDATE "Fatura" SET "status" = 'EM_PICAGEM' WHERE "status" IN ('PROCESSANDO');
UPDATE "Fatura" SET "status" = 'EM_VALORIZACAO' WHERE "status" IN ('EM_REVISAO');
UPDATE "Fatura" SET "status" = 'VALIDADO' WHERE "status" IN ('APROVADO');
UPDATE "Fatura" SET "status" = 'DIVERGENCIA' WHERE "status" IN ('REJEITADO');
-- EM_PICAGEM stays as is

-- Convert back to enum
ALTER TABLE "Fatura" ALTER COLUMN "status" TYPE "FaturaStatus" USING "status"::"FaturaStatus";

-- Restore default
ALTER TABLE "Fatura" ALTER COLUMN "status" SET DEFAULT 'RECEBIDO'::"FaturaStatus";
