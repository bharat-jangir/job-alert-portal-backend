import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactQuery, ContactQueryDocument } from './schemas/contact-query.schema';
import { CreateContactQueryDto, UpdateContactQueryDto } from './dto/contact-query.dto';

@Injectable()
export class ContactService {
  constructor(
    @InjectModel(ContactQuery.name) private contactQueryModel: Model<ContactQueryDocument>,
  ) {}

  async create(dto: CreateContactQueryDto): Promise<ContactQuery> {
    const newQuery = new this.contactQueryModel(dto);
    return newQuery.save();
  }

  async findAll(): Promise<ContactQuery[]> {
    return this.contactQueryModel.find().sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string): Promise<ContactQuery> {
    const query = await this.contactQueryModel.findById(id).exec();
    if (!query) throw new NotFoundException(`Contact query ${id} not found`);
    return query;
  }

  async update(id: string, dto: UpdateContactQueryDto): Promise<ContactQuery> {
    const query = await this.contactQueryModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!query) throw new NotFoundException(`Contact query ${id} not found`);
    return query;
  }

  async remove(id: string): Promise<void> {
    const res = await this.contactQueryModel.deleteOne({ _id: id }).exec();
    if (res.deletedCount === 0) throw new NotFoundException(`Contact query ${id} not found`);
  }
}
