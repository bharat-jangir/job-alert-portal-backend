import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PoliciesGuard } from '../auth/guards/policies.guard';
import { CheckPolicies } from '../auth/decorators/policies.decorator';
import { Action, Resource } from '../auth/enums/role.enum';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/user.dto';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.READ, resource: Resource.USER })
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'Return all users (without password hashes)' })
  findAll() {
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.CREATE, resource: Resource.USER })
  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.UPDATE, resource: Resource.USER })
  @Patch(':id')
  @ApiOperation({ summary: 'Update role / active state / name, or reset a password' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    return this.usersService.update(id, dto, req.user.id);
  }

  @UseGuards(JwtAuthGuard, PoliciesGuard)
  @CheckPolicies({ action: Action.DELETE, resource: Resource.USER })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @Req() req: any) {
    return this.usersService.remove(id, req.user.id);
  }
}
