import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type OrganizationDocument = Organization & Document;

@Schema({ timestamps: true })
export class Organization {
  @Prop({ required: true, unique: true, index: true })
  name: string;

  @Prop({ unique: true, index: true })
  slug?: string;

  @Prop()
  logo?: string;

  @Prop()
  description?: string;

  @Prop({ default: true })
  isActive?: boolean;
}

export const OrganizationSchema = SchemaFactory.createForClass(Organization);
