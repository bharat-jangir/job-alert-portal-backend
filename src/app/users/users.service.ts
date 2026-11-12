import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { UpdateUserDto } from './dto/user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

  /** Includes the password hash: for the login flow only. */
  async findByEmail(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: (email ?? '').toLowerCase().trim() }).exec();
  }

  /** Never returns the password hash. */
  async create(userData: CreateUserDto | Partial<User>): Promise<Omit<User, 'password'>> {
    const email = (userData.email ?? '').toLowerCase().trim();
    if (await this.userModel.exists({ email })) throw new ConflictException('A user with this email already exists');
    const password = await bcrypt.hash(userData.password as string, BCRYPT_ROUNDS);
    const created = await new this.userModel({ ...userData, email, password }).save();
    return this.stripPassword(created);
  }

  async findAll(): Promise<User[]> {
    return this.userModel.find().select('-password').sort({ createdAt: -1 }).exec();
  }

  async findById(id: string): Promise<User | null> {
    return this.userModel.findById(id).exec();
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    if (id === actorId) {
      if (dto.isActive === false) throw new BadRequestException('You cannot deactivate your own account');
      if (dto.role && dto.role !== 'super-admin') throw new BadRequestException('You cannot change your own role');
    }
    const patch: Record<string, unknown> = { ...dto };
    if (dto.password) patch.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    else delete patch.password;
    const user = await this.userModel.findByIdAndUpdate(id, patch, { new: true }).select('-password').exec();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async changePassword(id: string, currentPassword: string, newPassword: string) {
    const user = await this.userModel.findById(id).exec();
    if (!user) throw new NotFoundException('User not found');
    if (!(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('Current password is incorrect');
    }
    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();
    return { success: true };
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException('You cannot delete your own account');
    const res = await this.userModel.deleteOne({ _id: id }).exec();
    if (res.deletedCount === 0) throw new NotFoundException('User not found');
  }

  private stripPassword(doc: UserDocument) {
    const { password, ...rest } = doc.toObject();
    return rest as Omit<User, 'password'>;
  }
}
