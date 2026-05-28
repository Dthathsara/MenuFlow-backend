import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AddMenuItem, Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddMenuItemsQueryDto,
  CreateAddMenuItemDto,
  UpdateAddMenuItemDto,
} from './dto/menu-item.dto';

@Injectable()
export class AddMenuItemsService {
  constructor(private prisma: PrismaService) {}

  async getCustomerMenu(query: { tenantId?: string; slug?: string }) {
    console.log('CUSTOMER MENU USING add_menu_items');

    try {
      const tenantId = await this.resolveCustomerTenantId(query);
      if (!tenantId) {
        return {
          restaurant: null,
          categories: [],
        };
      }

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true },
      });

      if (!tenant) {
        throw new NotFoundException('Restaurant not found');
      }

      const items = await this.prisma.addMenuItem.findMany({
        where: {
          tenantId,
          deletedAt: null,
          isActive: true,
          isAvailable: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });

      return {
        restaurant: {
          id: tenant.id,
          name: tenant.name,
        },
        categories: this.groupCustomerMenuItems(items),
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      console.error('Failed to load customer menu from add_menu_items:', error);
      throw new InternalServerErrorException('Unable to load customer menu. Please try again later.');
    }
  }

  async findAll(currentUser: any, query: AddMenuItemsQueryDto) {
    const tenantId = await this.getTenantIdForUser(currentUser);
    const where: Prisma.AddMenuItemWhereInput = {
      tenantId,
      deletedAt: null,
      isActive: true,
    };

    const search = query.search?.trim();
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const categoryName = (query.categoryName ?? query.category_name)?.trim();
    if (categoryName) {
      where.categoryName = { equals: categoryName, mode: 'insensitive' };
    }

    if (query.availability === 'available') {
      where.isAvailable = true;
    }

    if (query.availability === 'unavailable') {
      where.isAvailable = false;
    }

    const items = await this.prisma.addMenuItem.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return items.map((item) => this.mapAddMenuItem(item));
  }

  async create(dto: CreateAddMenuItemDto, currentUser: any) {
    console.log('MANAGER CREATE USING add_menu_items', {
      name: dto.name,
      hasImage: Boolean(dto.image_url),
      imageStart: dto.image_url?.slice?.(0, 30),
    });

    const tenantId = await this.getTenantIdForUser(currentUser);
    const name = dto.name.trim();
    const categoryName = dto.category_name.trim();

    if (!name) {
      throw new BadRequestException('Menu item name is required.');
    }

    if (!categoryName) {
      throw new BadRequestException('Category is required.');
    }

    const item = await this.prisma.addMenuItem.create({
      data: {
        tenantId,
        name,
        categoryName,
        subCategoryName: dto.sub_category_name?.trim() || null,
        description: dto.description?.trim(),
        smallPrice: this.toDecimal(dto.small_price, 'small_price'),
        mediumPrice: this.toDecimal(dto.medium_price, 'medium_price'),
        largePrice: this.toDecimal(dto.large_price, 'large_price'),
        prepTimeMin: dto.prep_time_min,
        isAvailable: dto.is_available,
        imageUrl: this.normalizeImageUrl(dto.image_url),
        isActive: true,
        sortOrder: 0,
      },
    });

    console.log('Saved add_menu_items image_url:', item.imageUrl?.slice?.(0, 30));

    return this.mapAddMenuItem(item);
  }

  async update(id: string, dto: UpdateAddMenuItemDto, currentUser: any) {
    const tenantId = await this.getTenantIdForUser(currentUser);
    await this.findByIdForTenant(id, tenantId);

    const data: Prisma.AddMenuItemUpdateInput = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Menu item name is required.');
      }
      data.name = name;
    }

    if (dto.category_name !== undefined) {
      const categoryName = dto.category_name?.trim();
      if (!categoryName) {
        throw new BadRequestException('Category is required.');
      }
      data.categoryName = categoryName;
    }

    if (dto.sub_category_name !== undefined) {
      data.subCategoryName = dto.sub_category_name?.trim() || null;
    }

    if (dto.description !== undefined) data.description = dto.description?.trim();
    if (dto.small_price !== undefined) data.smallPrice = this.toDecimal(dto.small_price, 'small_price');
    if (dto.medium_price !== undefined) data.mediumPrice = this.toDecimal(dto.medium_price, 'medium_price');
    if (dto.large_price !== undefined) data.largePrice = this.toDecimal(dto.large_price, 'large_price');
    if (dto.prep_time_min !== undefined) data.prepTimeMin = dto.prep_time_min;
    if (dto.is_available !== undefined) data.isAvailable = dto.is_available;
    if (dto.image_url !== undefined) data.imageUrl = this.normalizeImageUrl(dto.image_url);

    const item = await this.prisma.addMenuItem.update({
      where: { id },
      data,
    });

    return this.mapAddMenuItem(item);
  }

  async softDelete(id: string, currentUser: any) {
    const tenantId = await this.getTenantIdForUser(currentUser);
    await this.findByIdForTenant(id, tenantId);

    await this.prisma.addMenuItem.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    });
  }

  async findCategories(currentUser: any) {
    const tenantId = await this.getTenantIdForUser(currentUser);

    const categories = await this.prisma.addMenuItem.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        categoryName: { not: '' },
      },
      distinct: ['categoryName'],
      select: { categoryName: true },
      orderBy: { categoryName: 'asc' },
    });

    return categories.map((category) => ({ name: category.categoryName }));
  }

  private async findByIdForTenant(id: string, tenantId: string) {
    const item = await this.prisma.addMenuItem.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
        isActive: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`AddMenuItem ${id} not found`);
    }

    return item;
  }

  private async resolveCustomerTenantId(query: { tenantId?: string; slug?: string }) {
    const tenantId = query.tenantId?.trim();
    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });

      if (!tenant) {
        throw new NotFoundException('Restaurant not found');
      }

      return tenant.id;
    }

    const slug = query.slug?.trim();
    if (slug) {
      const qrCode = await this.prisma.qrCode.findUnique({
        where: { slug },
        select: { tenantId: true, isActive: true },
      });

      if (!qrCode?.isActive) {
        throw new NotFoundException('Menu not found or this QR code is inactive');
      }

      return qrCode.tenantId;
    }

    const item = await this.prisma.addMenuItem.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        isAvailable: true,
      },
      select: { tenantId: true },
      orderBy: { createdAt: 'desc' },
    });

    return item?.tenantId ?? null;
  }

  private getUserId(currentUser: any) {
    const userId = typeof currentUser === 'string' ? currentUser : currentUser?.id ?? currentUser?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authentication is required.');
    }
    return userId;
  }

  private async getTenantIdForUser(currentUser: any) {
    if (typeof currentUser === 'object' && currentUser?.tenantId) {
      return currentUser.tenantId;
    }

    const userId = this.getUserId(currentUser);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });

    if (!user?.tenantId) {
      throw new ForbiddenException('Your account is not connected to a restaurant.');
    }

    return user.tenantId;
  }

  private normalizeImageUrl(imageUrl?: string | null) {
    const maxImageUrlLength = 15 * 1024 * 1024;

    if (imageUrl === undefined || imageUrl === null) {
      return imageUrl;
    }

    const trimmed = imageUrl.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.length > maxImageUrlLength) {
      throw new BadRequestException('Image is too large. Please upload an image under 10MB.');
    }

    if (trimmed.startsWith('data:')) {
      if (!/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(trimmed)) {
        throw new BadRequestException(
          'Invalid image format. Only PNG, JPG, JPEG, and WEBP images are supported.',
        );
      }
      return trimmed;
    }

    if (
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('/')
    ) {
      return trimmed;
    }

    throw new BadRequestException(
      'Invalid image format. Only PNG, JPG, JPEG, and WEBP images are supported.',
    );
  }

  private toDecimal(value: number | undefined, fieldName: string) {
    const numericValue = value ?? 0;
    if (!Number.isFinite(numericValue) || numericValue < 0) {
      throw new BadRequestException(`${fieldName} must be a number greater than or equal to 0.`);
    }

    return new Prisma.Decimal(numericValue);
  }

  private mapAddMenuItem(item: AddMenuItem) {
    return {
      id: item.id,
      tenant_id: item.tenantId,
      name: item.name,
      category_name: item.categoryName,
      sub_category_name: item.subCategoryName,
      description: item.description,
      small_price: Number(item.smallPrice ?? 0),
      medium_price: Number(item.mediumPrice ?? 0),
      large_price: Number(item.largePrice ?? 0),
      prep_time_min: item.prepTimeMin,
      is_available: item.isAvailable,
      is_active: item.isActive,
      sort_order: item.sortOrder,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
      image_url: item.imageUrl,
    };
  }

  private groupCustomerMenuItems(items: AddMenuItem[]) {
    const categories = new Map<
      string,
      {
        id: string;
        name: string;
        accentLabel: string;
        description: string;
        subcategories: Map<
          string,
          {
            id: string;
            name: string;
            description: string;
            items: any[];
          }
        >;
      }
    >();

    for (const item of items) {
      const categoryName = item.categoryName?.trim() || 'Uncategorized';
      const subCategoryName = item.subCategoryName?.trim() || 'General';
      const categoryId = this.slugify(categoryName);
      const subCategoryId = this.slugify(subCategoryName);

      if (!categories.has(categoryId)) {
        categories.set(categoryId, {
          id: categoryId,
          name: categoryName,
          accentLabel: categoryName,
          description: categoryName,
          subcategories: new Map(),
        });
      }

      const category = categories.get(categoryId)!;
      if (!category.subcategories.has(subCategoryId)) {
        category.subcategories.set(subCategoryId, {
          id: subCategoryId,
          name: subCategoryName,
          description: subCategoryName,
          items: [],
        });
      }

      const smallPrice = Number(item.smallPrice ?? 0);
      const mediumPrice = Number(item.mediumPrice ?? 0);
      const largePrice = Number(item.largePrice ?? 0);

      category.subcategories.get(subCategoryId)!.items.push({
        id: item.id,
        name: item.name,
        category_name: categoryName,
        categoryName,
        sub_category_name: subCategoryName,
        subCategoryName,
        description: item.description,
        image_url: item.imageUrl,
        image: item.imageUrl,
        small_price: smallPrice,
        medium_price: mediumPrice,
        large_price: largePrice,
        prep_time_min: item.prepTimeMin ?? 12,
        prepTime: item.prepTimeMin ?? 12,
        basePrice: smallPrice,
        servingPrices: {
          Small: smallPrice,
          Medium: mediumPrice,
          Large: largePrice,
        },
        is_available: item.isAvailable,
        available: item.isAvailable,
        spiceLevel: 'Chef pick',
      });
    }

    return Array.from(categories.values()).map((category) => ({
      ...category,
      subcategories: Array.from(category.subcategories.values()),
    }));
  }

  private slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'uncategorized';
  }
}
