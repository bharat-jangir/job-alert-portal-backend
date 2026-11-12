import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/organization.schema';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { Job, JobDocument } from '../jobs/schemas/job.schema';
import { CacheService } from '../../common/services/cache.service';
import { RevalidateService } from '../../common/services/revalidate.service';
import { slugify } from '../../common/utils/text';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private organizationModel: Model<OrganizationDocument>,
    @InjectModel(Job.name) private jobModel: Model<JobDocument>,
    private cache: CacheService,
    private revalidate: RevalidateService,
  ) {}

  private changed() {
    this.cache.invalidate('jobs:');
    this.revalidate.trigger({ tags: ['organizations', 'posts', 'home'] });
  }

  async create(createOrganizationDto: CreateOrganizationDto): Promise<Organization> {
    if (!createOrganizationDto.slug) {
      createOrganizationDto.slug = slugify(createOrganizationDto.name);
    }
    const created = await new this.organizationModel(createOrganizationDto).save();
    this.changed();
    return created;
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
      .findByIdAndUpdate(id, updateOrganizationDto, { new: true, runValidators: true })
      .exec();
    if (!org) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    // posts keep a denormalised organization name: keep it in sync on rename
    if (updateOrganizationDto.name) {
      await this.jobModel.updateMany({ organizationId: org._id }, { organization: org.name });
    }
    this.changed();
    return org;
  }

  async remove(id: string): Promise<void> {
    if (await this.jobModel.exists({ organizationId: id })) {
      throw new ConflictException('This organization has posts. Deactivate it instead of deleting.');
    }
    const result = await this.organizationModel.deleteOne({ _id: id }).exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Organization with ID ${id} not found`);
    }
    this.changed();
  }
}
