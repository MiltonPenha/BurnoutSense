import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveDailyCheckInDto } from './dto/save-daily-check-in.dto';
import { calendarDay, utcDay } from './calendar-day';
import { ContextEvolutionService } from './context-evolution.service';

@Injectable()
export class DailyCheckInsService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly evolution: ContextEvolutionService) {}

  private clock() {
    const timeZone = this.config.get<string>('DAILY_REMINDER_TIMEZONE') ?? 'America/Sao_Paulo';
    return { timeZone, today: calendarDay(new Date(), timeZone) };
  }

  private validateDate(key: string) {
    const parsed = utcDay(key);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== key || key > this.clock().today) {
      throw new BadRequestException('Escolha uma data válida, de hoje ou de um dia anterior.');
    }
    return parsed;
  }

  async overview(userId: string) {
    try {
      const { timeZone, today } = this.clock();
      const since = utcDay(today); since.setUTCDate(since.getUTCDate() - 27);
      const recentCheckIns = await this.prisma.dailyCheckIn.findMany({ where: { userId, date: { gte: since, lte: utcDay(today) } }, orderBy: { date: 'desc' }, take: 28 });
      return { today, timeZone, completedDays: recentCheckIns.length, recentCheckIns, windowStart: since.toISOString().slice(0, 10),
        todayCheckIn: recentCheckIns.find(item => item.date.toISOString().slice(0, 10) === today) ?? null,
        evolution: await this.evolution.status(userId) };
    } catch {
      throw new ServiceUnavailableException('Não foi possível consultar seu acompanhamento diário.');
    }
  }

  async day(userId: string, date: string) {
    const value = this.validateDate(date);
    try {
      return { date, checkIn: await this.prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: value } } }) };
    } catch { throw new ServiceUnavailableException('Não foi possível consultar este dia.'); }
  }

  async saveToday(userId: string, payload: SaveDailyCheckInDto) {
    return this.save(userId, { ...payload, date: this.clock().today });
  }

  async save(userId: string, payload: SaveDailyCheckInDto) {
    const date = this.validateDate(payload.date ?? this.clock().today);
    let saved;
    try {
      const context = await this.prisma.esbeuAssessment.findFirst({ where: { userId, source: 'context' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true } });
      if (!context) throw new ConflictException('Complete ou revise seu acompanhamento inicial antes do check-in.');
      const data = { mood: payload.mood, sleepHours: payload.sleepHours, energy: payload.energy ?? null, academicDemand: payload.academicDemand ?? null,
        observations: payload.observations ? { ...payload.observations } as Prisma.InputJsonObject : Prisma.DbNull,
        note: payload.note?.trim() ?? '', contextAssessmentId: context.id };
      saved = await this.prisma.dailyCheckIn.upsert({ where: { userId_date: { userId, date } }, create: { userId, date, ...data }, update: data });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new ServiceUnavailableException('Não foi possível salvar seu check-in. Consulte o histórico antes de tentar novamente.');
    }
    return { ...saved, indexUpdate: await this.evolution.recalculate(userId) };
  }

  recalculate(userId: string) { return this.evolution.recalculate(userId); }

  async list(userId: string, cursor?: string) {
    try {
      if (cursor && !await this.prisma.dailyCheckIn.findFirst({ where: { id: cursor, userId }, select: { id: true } })) throw new NotFoundException('Registro não encontrado.');
      const rows = await this.prisma.dailyCheckIn.findMany({ where: { userId }, orderBy: [{ date: 'desc' }, { id: 'desc' }], take: 26,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      const items = rows.slice(0, 25);
      return { items, nextCursor: rows.length > 25 ? items[items.length - 1].id : null };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException('Não foi possível consultar seus check-ins.');
    }
  }

  async remove(userId: string, id: string) {
    try {
      const result = await this.prisma.dailyCheckIn.deleteMany({ where: { userId, id } });
      if (!result.count) throw new NotFoundException('Registro não encontrado.');
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ServiceUnavailableException('Não foi possível excluir este check-in.');
    }
    return { indexUpdate: await this.evolution.recalculate(userId) };
  }
}
