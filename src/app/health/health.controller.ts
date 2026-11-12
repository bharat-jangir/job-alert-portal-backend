import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import { Connection } from 'mongoose';

/** For load balancers / uptime monitors. Public, unthrottled, touches no data. */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private connection: Connection) {}

  @Get()
  check() {
    if (this.connection.readyState !== 1) throw new ServiceUnavailableException('Database not connected');
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }
}
