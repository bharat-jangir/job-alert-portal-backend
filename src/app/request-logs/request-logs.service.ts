import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RequestLog } from './schemas/request-log.schema';

@Injectable()
export class RequestLogsService {
  private readonly logger = new Logger(RequestLogsService.name);

  constructor(
    @InjectModel(RequestLog.name)
    private requestLogModel: Model<RequestLog>,
  ) {}

  async createLog(logData: Partial<RequestLog>): Promise<void> {
    try {
      const createdLog = new this.requestLogModel(logData);
      await createdLog.save();
    } catch (error) {
      this.logger.error('Failed to save request log', error);
    }
  }
}
