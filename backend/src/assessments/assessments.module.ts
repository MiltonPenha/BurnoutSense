import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  imports: [AiModule, NotificationsModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
