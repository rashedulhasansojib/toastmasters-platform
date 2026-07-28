-- CreateEnum
CREATE TYPE "ResourceSensitivity" AS ENUM ('normal', 'sensitive', 'restricted');

-- CreateEnum
CREATE TYPE "PermissionAction" AS ENUM ('read', 'create', 'update', 'delete', 'approve', 'export');

-- CreateEnum
CREATE TYPE "PermissionCondition" AS ENUM ('any', 'own', 'assigned', 'party', 'published');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('allow', 'deny');

-- CreateEnum
CREATE TYPE "RoleTemplateTier" AS ENUM ('club', 'area', 'division', 'district', 'platform');

-- CreateEnum
CREATE TYPE "RoleTemplateScopeRule" AS ENUM ('self_unit', 'self_subtree');

-- NOTE: the generator also proposed DROP INDEX "org_unit_path_gist" and
-- "org_unit_path_unique" here — same false-positive drift as the identity
-- migration (Slice 2): both are hand-added on the Unsupported("ltree") `path`
-- column, invisible to Prisma's diff engine. Deliberately omitted.

-- CreateTable
CREATE TABLE "resource_catalog" (
    "resource" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "allowed_actions" "PermissionAction"[],
    "club_scoped" BOOLEAN NOT NULL DEFAULT true,
    "sensitivity" "ResourceSensitivity" NOT NULL DEFAULT 'normal',

    CONSTRAINT "resource_catalog_pkey" PRIMARY KEY ("resource")
);

-- CreateTable
CREATE TABLE "role_template" (
    "role" TEXT NOT NULL,
    "tier" "RoleTemplateTier" NOT NULL,
    "unit_types" "OrgUnitType"[],
    "scope_rule" "RoleTemplateScopeRule" NOT NULL DEFAULT 'self_unit',
    "is_singleton" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,

    CONSTRAINT "role_template_pkey" PRIMARY KEY ("role")
);

-- CreateTable
CREATE TABLE "role_template_grant" (
    "role" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" "PermissionAction" NOT NULL,
    "condition" "PermissionCondition" NOT NULL DEFAULT 'any',
    "effect" "PermissionEffect" NOT NULL DEFAULT 'allow',
    "fields" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "role_template_grant_pkey" PRIMARY KEY ("role","resource","action","condition")
);

-- AddForeignKey
ALTER TABLE "role_template_grant" ADD CONSTRAINT "role_template_grant_role_fkey" FOREIGN KEY ("role") REFERENCES "role_template"("role") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_template_grant" ADD CONSTRAINT "role_template_grant_resource_fkey" FOREIGN KEY ("resource") REFERENCES "resource_catalog"("resource") ON DELETE RESTRICT ON UPDATE CASCADE;
