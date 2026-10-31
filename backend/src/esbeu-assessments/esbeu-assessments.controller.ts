import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateEsbeuAssessmentDto } from './dto/create-esbeu-assessment.dto';
import { ListEsbeuAssessmentsDto } from './dto/list-esbeu-assessments.dto';
import { EsbeuAssessmentsService } from './esbeu-assessments.service';

@UseGuards(JwtAuthGuard)
@Controller('esbeu-assessments')
export class EsbeuAssessmentsController {
  constructor(private readonly service: EsbeuAssessmentsService) {}

  @Get('form')
  @Header('Cache-Control', 'no-store')
  form() { return this.service.form(); }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() user: AuthenticatedUser, @Body() payload: CreateEsbeuAssessmentDto) {
    return this.service.create(user.id, payload);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEsbeuAssessmentsDto) {
    return this.service.list(user.id, query.cursor);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.detail(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(user.id, id);
  }
}
