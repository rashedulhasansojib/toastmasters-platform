import { Controller, Get } from '@nestjs/common';
import type { RoleTemplateSummary } from '@toastmasters/contracts';
import { RoleTemplateRepository } from './role-template.repository';

/** The Users admin role picker's catalogue — no @ResourceScope, same posture as support.profile's self-service routes. */
@Controller()
export class RoleTemplateController {
  constructor(private readonly roleTemplates: RoleTemplateRepository) {}

  @Get('role-templates')
  async list(): Promise<RoleTemplateSummary[]> {
    return this.roleTemplates.findAll();
  }
}
