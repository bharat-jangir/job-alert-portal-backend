import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/organization.schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private organizationModel: Model<OrganizationDocument>,
  ) {}

  async create(createOrganizationDto: CreateOrganizationDto): Promise<Organization> {
    if (!createOrganizationDto.slug) {
      createOrganizationDto.slug = createOrganizationDto.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }
    const created = new this.organizationModel(createOrganizationDto);
    return created.save();
  }

  async findAll(): Promise<Organization[]> {
    return this.organizationModel.find().sort({ name: 1 }).exec();
  }

  async findActive(): Promise<Organization[]> {
    return this.organizationModel.find({ isActive: true }).sort({ name: 1 }).exec();
  }

  async findOne(id: string): Promise<Organization> {
    const org = await this.organizationModel.findById(id).exec();
    if (!org) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return org;
  }

  async update(id: string, updateOrganizationDto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.organizationModel
      .findByIdAndUpdate(id, updateOrganizationDto, { new: true })
      .exec();
    if (!org) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    return org;
  }

  async remove(id: string): Promise<void> {
    const result = await this.organizationModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
  }
}
