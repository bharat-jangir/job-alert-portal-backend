import { IsString, IsEmail, MinLength, IsIn, IsOptional } from 'class-validator';

export class CreateContactQueryDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  subject: string;

  @IsString()
  @MinLength(10)
  message: string;
}

export class UpdateContactQueryDto {
  @IsOptional()
  @IsIn(['New', 'In Progress', 'Resolved'])
  status?: string;
}
