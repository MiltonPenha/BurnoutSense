import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DailyCheckInsService } from './daily-check-ins.service';
import { calendarDay } from './calendar-day';
import { SaveDailyCheckInDto } from './dto/save-daily-check-in.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ContextEvolutionService } from './context-evolution.service';

describe('Daily check-ins independent of model inference', () => {
  let table: { upsert: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; deleteMany: jest.Mock };
  let context: { findFirst: jest.Mock };
  let service: DailyCheckInsService;
  const payload = { mood: 'Calmo', sleepHours: 7.5, energy: 2, academicDemand: 3, note: ' exemplo ' };
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-05T01:30:00Z'));
    table = { upsert: jest.fn().mockResolvedValue({ id: 'daily' }), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(), deleteMany: jest.fn() };
    context = { findFirst: jest.fn().mockResolvedValue({ id: 'context' }) };
    service = new DailyCheckInsService({ dailyCheckIn: table, esbeuAssessment: context } as unknown as PrismaService,
      { get: () => 'America/Sao_Paulo' } as unknown as ConfigService,
      { status: jest.fn().mockResolvedValue({ enabled: false, pending: false }), recalculate: jest.fn().mockResolvedValue({ status: 'unavailable' }) } as unknown as ContextEvolutionService);
  });
  afterEach(() => jest.useRealTimers());

  it('saves exactly one entry per local day with reference to the existing context', async () => {
    await service.saveToday('owner', payload);
    expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_date: { userId: 'owner', date: new Date('2026-11-04T00:00:00Z') } },
      create: expect.objectContaining({ contextAssessmentId: 'context', mood: 'Calmo', note: 'exemplo' }),
      update: expect.objectContaining({ energy: 2 }),
    }));
    expect(context.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner', source: 'context' } }));
  });
  it('requires an initial assessment without fabricating one', async () => {
    context.findFirst.mockResolvedValue(null);
    await expect(service.saveToday('owner', payload)).rejects.toBeInstanceOf(ConflictException);
    expect(table.upsert).not.toHaveBeenCalled();
  });
  it('accepts a forgotten day without changing the server calendar date', async () => {
    const saved = await service.save('owner', { ...payload, date: '2026-11-03' });
    expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_date: { userId: 'owner', date: new Date('2026-11-03T00:00:00Z') } } }));
    expect(saved.indexUpdate.status).toBe('unavailable');
    expect((await service.overview('owner')).today).toBe('2026-11-04');
  });
  it('rejects future and nonexistent calendar dates', async () => {
    for (const date of ['2026-11-05', '2026-02-31', 'invalid']) await expect(service.save('owner', { ...payload, date })).rejects.toThrow('data válida');
    expect(table.upsert).not.toHaveBeenCalled();
  });
  it('sanitizes persistence failures', async () => {
    table.upsert.mockRejectedValue(new Error('private-note-marker'));
    await expect(service.saveToday('owner', payload)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('sanitizes failures when reading or deleting private daily observations', async () => {
    table.findMany.mockRejectedValue(new Error('private-note-marker'));
    await expect(service.overview('owner')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.list('owner')).rejects.toBeInstanceOf(ServiceUnavailableException);
    table.deleteMany.mockRejectedValue(new Error('private-note-marker'));
    await expect(service.remove('owner', 'daily')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('uses 28 calendar days, not the latest 28 entries or synthetic missing days', async () => {
    table.findMany.mockResolvedValue([{ id: 'daily', date: new Date('2026-11-04T00:00:00Z') }]);
    const overview = await service.overview('owner');
    expect(overview.today).toBe('2026-11-04'); expect(overview.completedDays).toBe(1);
    expect(overview.todayCheckIn?.id).toBe('daily');
    expect(table.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'owner', date: {
      gte: new Date('2026-10-08T00:00:00Z'), lte: new Date('2026-11-04T00:00:00Z'),
    } } }));
  });
  it('rejects a foreign cursor and deletion', async () => {
    table.findFirst.mockResolvedValue(null);
    await expect(service.list('other', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    table.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('other', 'foreign')).rejects.toBeInstanceOf(NotFoundException);
    expect(table.deleteMany).toHaveBeenCalledWith({ where: { userId: 'other', id: 'foreign' } });
  });
  it('paginates private daily history', async () => {
    table.findMany.mockResolvedValue(Array.from({ length: 26 }, (_, id) => ({ id: String(id) })));
    const page = await service.list('owner'); expect(page.items).toHaveLength(25); expect(page.nextCursor).toBe('24');
  });
  it('respects calendar days through a daylight-saving boundary', () => {
    expect(calendarDay(new Date('2026-03-08T06:30:00Z'), 'America/New_York')).toBe('2026-03-08');
    expect(calendarDay(new Date('2026-03-08T07:30:00Z'), 'America/New_York')).toBe('2026-03-08');
  });
  it('rejects invalid daily domains and long notes', async () => {
    for (const invalid of [{ energy: 5 }, { academicDemand: -1 }, { sleepHours: 25 }, { mood: 'invented' }, { note: 'x'.repeat(501) }]) {
      const dto = Object.assign(new SaveDailyCheckInDto(), payload, invalid);
      expect((await validate(dto)).length).toBeGreaterThan(0);
    }
  });
  it('accepts canonical nested observations but rejects arrays and invalid ordinal values', async () => {
    const observations = { sleep_quality: 2, assessment_pressure: 3, study_rest_difficulty: 1, personal_support: 4 };
    expect(await validate(plainToInstance(SaveDailyCheckInDto, { ...payload, observations }))).toHaveLength(0);
    for (const invalid of [[observations], { ...observations, sleep_quality: 5 }, { ...observations, personal_support: 1.5 }]) {
      expect((await validate(plainToInstance(SaveDailyCheckInDto, { ...payload, observations: invalid }))).length).toBeGreaterThan(0);
    }
  });
});
