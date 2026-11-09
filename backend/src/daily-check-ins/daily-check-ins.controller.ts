import { BadRequestException, Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ListEsbeuAssessmentsDto } from '../esbeu-assessments/dto/list-esbeu-assessments.dto';
import { DailyDateDto, SaveDailyCheckInDto } from './dto/save-daily-check-in.dto';
import { DailyCheckInsService } from './daily-check-ins.service';

@UseGuards(JwtAuthGuard)
@Controller('daily-check-ins')
export class DailyCheckInsController {
  constructor(private readonly service: DailyCheckInsService) {}

  @Get('overview')
  @Header('Cache-Control', 'no-store')
  overview(@CurrentUser() user: AuthenticatedUser) { return this.service.overview(user.id); }

  @Get('day/:date')
  @Header('Cache-Control', 'no-store')
  day(@CurrentUser() user: AuthenticatedUser, @Param() params: DailyDateDto) { return this.service.day(user.id, params.date); }

  @Post('recalculate')
  @Header('Cache-Control', 'no-store')
  recalculate(@CurrentUser() user: AuthenticatedUser) { return this.service.recalculate(user.id); }

  @Put()
  @Header('Cache-Control', 'no-store')
  saveDate(@CurrentUser() user: AuthenticatedUser, @Body() payload: SaveDailyCheckInDto) {
    if (!payload.date || !payload.observations) throw new BadRequestException('Informe a data e as respostas do acompanhamento.');
    return this.service.save(user.id, payload);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListEsbeuAssessmentsDto) { return this.service.list(user.id, query.cursor); }

  @Put('today')
  @Header('Cache-Control', 'no-store')
  save(@CurrentUser() user: AuthenticatedUser, @Body() payload: SaveDailyCheckInDto) { return this.service.saveToday(user.id, payload); }

  @Delete(':id')
  @Header('Cache-Control', 'no-store')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.remove(user.id, id); }
}
