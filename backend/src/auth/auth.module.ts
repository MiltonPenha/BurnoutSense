import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionSecurityService } from './session-security.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PasswordResetService } from './password-reset.service';

@Global()
@Module({
  imports: [JwtModule.register({}), NotificationsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard, SessionSecurityService, PasswordResetService],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard, SessionSecurityService],
})
export class AuthModule {}
