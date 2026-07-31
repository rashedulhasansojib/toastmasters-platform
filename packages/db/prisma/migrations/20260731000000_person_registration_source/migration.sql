-- CreateEnum
CREATE TYPE "PersonRegistrationSource" AS ENUM ('demo_signup');

-- AlterTable
ALTER TABLE "person" ADD COLUMN     "registration_source" "PersonRegistrationSource";
