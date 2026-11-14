import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @SkipThrottle()
  @Get()
  @Header('Cache-Control', 'no-store')
  async health() {
    try { await this.prisma.$queryRaw`SELECT 1`; return { status: 'ok' }; }
    catch { throw new ServiceUnavailableException('Service unavailable.'); }
  }
}
