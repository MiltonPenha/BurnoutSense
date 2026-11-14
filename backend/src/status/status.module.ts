import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { StatusController } from './status.controller';
import { HealthController } from './health.controller';
import { StatusService } from './status.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [StatusController, HealthController],
  providers: [StatusService],
})
export class StatusModule {}
