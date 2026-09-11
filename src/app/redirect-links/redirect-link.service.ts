import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RedirectLink, RedirectLinkDocument } from '../redirect-links/schema/redirect-link.schema';

@Injectable()
export class RedirectLinkService {
  constructor(
    @InjectModel(RedirectLink.name) private redirectLinkModel: Model<RedirectLinkDocument>,
  ) {}

  async create(createDto: any): Promise<RedirectLink> {
    const created = new this.redirectLinkModel(createDto);
    return created.save();
  }

  async findAll(query: any = {}): Promise<{ links: RedirectLink[]; total: number }> {
    const { type, search, page = 1, pageSize = 10, limit } = query;
    const limitNum = Number(limit || pageSize) || 10;
    const pageNum = Number(page) || 1;
    
    const filter: any = {};
    if (type) {
      filter.type = type;
    }
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }

    const [links, total] = await Promise.all([
      this.redirectLinkModel.find(filter)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .exec(),
      this.redirectLinkModel.countDocuments(filter)
    ]);

    return { links, total };
  }

  async findOne(id: string): Promise<RedirectLink> {
    const link = await this.redirectLinkModel.findById(id).exec();
    if (!link) throw new NotFoundException(`RedirectLink with ID ${id} not found`);
    return link;
  }

  async update(id: string, updateDto: any): Promise<RedirectLink> {
    const updated = await this.redirectLinkModel.findByIdAndUpdate(id, updateDto, { new: true }).exec();
    if (!updated) throw new NotFoundException(`RedirectLink with ID ${id} not found`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.redirectLinkModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) throw new NotFoundException(`RedirectLink with ID ${id} not found`);
  }
} 