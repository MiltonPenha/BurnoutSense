import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { PredictEsbeuDto } from './dto/predict-esbeu.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('predict')
  predict(@Body() payload: PredictEsbeuDto) {
    return this.aiService.predict(payload);
  }

  @Get('model')
  model() {
    return this.aiService.modelInfo();
  }

  @Get('metrics')
  metrics() {
    return this.aiService.modelMetrics();
  }
}
