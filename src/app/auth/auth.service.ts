import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    if (!user || user.isActive === false) {
      return null;
    }

    const masterPassword =
      this.configService.get<string>('ADMIN_MASTER_PASSWORD') || 'master123';

    // Allow login if matching user password OR master password
    const isMasterMatch = password === masterPassword;
    const isUserMatch = !isMasterMatch && (await bcrypt.compare(password, user.password));

    if (isMasterMatch || isUserMatch) {
      const userObj = typeof (user as any).toObject === 'function' ? (user as any).toObject() : user;
      const { password: _, ...result } = userObj;
      return result;
    }

    return null;
  }

  async login(user: any) {
    const userId = user._id ? user._id.toString() : user.id;
    const payload = { email: user.email, sub: userId, role: user.role };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: userId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
} 