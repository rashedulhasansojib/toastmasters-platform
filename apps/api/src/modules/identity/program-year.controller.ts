import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import type { ProgramYear } from '@toastmasters/contracts';
import { ProgramYearRepository } from './program-year.repository';

/**
 * Read-only reference lookup — no @ResourceScope, same posture as
 * role-template.controller.ts's catalogue route. Backs the Users admin's
 * "assign a role" form, which needs a program year's term boundaries to
 * prefill termStart/termEnd.
 */
@Controller()
export class ProgramYearController {
  constructor(private readonly programYears: ProgramYearRepository) {}

  @Get('program-years/:id')
  async findById(@Param('id') id: string): Promise<ProgramYear> {
    const year = await this.programYears.findById(id);
    if (!year) throw new NotFoundException('Program year not found');
    return year;
  }
}
