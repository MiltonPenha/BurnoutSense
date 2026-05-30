import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { StatusService } from './status.service';

@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  @SkipThrottle()
  @Get()
  getStatus() {
    return this.statusService.getStatus();
  }
}
