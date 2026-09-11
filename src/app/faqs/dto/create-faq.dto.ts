import { IsString, IsBoolean, IsNumber, IsOptional, MinLength } from 'class-validator';

export class CreateFaqDto {
  @IsString()
  @MinLength(5)
  question: string;

  @IsString()
  @MinLength(5)
  answer: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  order?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
