import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../../users/users.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  /** Re-checks the user so deactivation and role changes apply immediately, not at token expiry. */
  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub);
    if (!user || user.isActive === false) throw new UnauthorizedException();
    return { id: payload.sub, email: user.email, role: user.role };
  }
} 