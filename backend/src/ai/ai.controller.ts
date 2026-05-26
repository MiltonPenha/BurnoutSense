import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { PredictBurnoutDto } from './dto/predict-burnout.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @UseGuards(JwtAuthGuard)
  @Post('predict')
  predict(@Body() predictBurnoutDto: PredictBurnoutDto) {
    return this.aiService.predict(predictBurnoutDto);
  }
}
