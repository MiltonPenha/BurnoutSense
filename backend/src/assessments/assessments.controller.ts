import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { AssessmentsService } from './assessments.service';
import { CreateAssessmentDto } from './dto/create-assessment.dto';

@UseGuards(JwtAuthGuard)
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() createAssessmentDto: CreateAssessmentDto) {
    return this.assessmentsService.create(user.id, createAssessmentDto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.assessmentsService.findAllByUser(user.id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.assessmentsService.findOneByUser(user.id, id);
  }
}
