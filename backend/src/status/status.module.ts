import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
