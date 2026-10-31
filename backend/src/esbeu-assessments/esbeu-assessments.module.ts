import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { EsbeuAssessmentsController } from './esbeu-assessments.controller';
import { EsbeuAssessmentsService } from './esbeu-assessments.service';

@Module({ imports: [AiModule], controllers: [EsbeuAssessmentsController], providers: [EsbeuAssessmentsService] })
export class EsbeuAssessmentsModule {}
