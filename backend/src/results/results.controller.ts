import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ResultsService } from './results.service';

@UseGuards(JwtAuthGuard)
@Controller('results')
export class ResultsController {
  constructor(private readonly resultsService: ResultsService) {}

  @Get(':assessmentId')
  findByAssessmentId(
    @CurrentUser() user: AuthenticatedUser,
    @Param('assessmentId') assessmentId: string,
  ) {
    return this.resultsService.findByAssessmentId(user.id, assessmentId);
  }
}
