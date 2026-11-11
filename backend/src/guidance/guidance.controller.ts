import { Controller, Get, Header, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { GuidanceService } from './guidance.service';

@UseGuards(JwtAuthGuard)
@Controller('guidance')
export class GuidanceController {
  constructor(private readonly service: GuidanceService) {}

  @Get(':assessmentId')
  @Header('Cache-Control', 'no-store')
  get(@CurrentUser() user: AuthenticatedUser, @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string) {
    return this.service.forAssessment(user.id, assessmentId);
  }
}
