import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type ContactQueryDocument = ContactQuery & Document;

@Schema({ timestamps: true })
export class ContactQuery {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: 'New', enum: ['New', 'In Progress', 'Resolved'] })
  status: string;
}

export const ContactQuerySchema = SchemaFactory.createForClass(ContactQuery);
