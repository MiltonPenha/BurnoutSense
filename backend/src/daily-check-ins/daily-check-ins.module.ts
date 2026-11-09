import { Module } from '@nestjs/common';
import { DailyCheckInsController } from './daily-check-ins.controller';
import { DailyCheckInsService } from './daily-check-ins.service';
import { AiModule } from '../ai/ai.module';
import { ContextEvolutionService } from './context-evolution.service';

@Module({ imports: [AiModule], controllers: [DailyCheckInsController], providers: [DailyCheckInsService, ContextEvolutionService] })
export class DailyCheckInsModule {}
