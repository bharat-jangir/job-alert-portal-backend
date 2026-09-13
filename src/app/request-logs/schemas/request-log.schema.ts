import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class RequestLog extends Document {
  @Prop({ required: true })
  method: string;

  @Prop({ required: true })
  url: string;

  @Prop({ type: Object })
  query: Record<string, any>;

  @Prop({ type: Object })
  body: Record<string, any>;

  @Prop()
  ip: string;

  @Prop()
  userAgent: string;

  @Prop({ required: true })
  statusCode: number;

  @Prop({ required: true })
  responseTime: number; // in milliseconds
}

export const RequestLogSchema = SchemaFactory.createForClass(RequestLog);
