import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AddMenuItem, Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddMenuItemsQueryDto,
  CreateAddMenuItemDto,
  UpdateAddMenuItemDto,
} from './dto/menu-item.dto';

@Injectable()
export class AddMenuItemsService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async getCustomerMenu(query: { tenantId?: string; slug?: string; authorization?: string }) {
    try {
      const resolved = await this.resolveCustomerTenant(query);

      if (!resolved.tenantId) {
        return {
          restaurant: this.defaultRestaurant(),
          categories: [],
        };
      }

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: resolved.tenantId },
        select: { id: true, name: true },
      });

      if (!tenant) {
        return {
          restaurant: this.defaultRestaurant(),
          categories: [],
        };
      }

      const user = await this.prisma.user.findFirst({
        where: {
          tenantId: resolved.tenantId,
          deletedAt: null,
        },
        select: {
          hotelName: true,
          businessType: true,
          businessLocation: true,
          businessAddress: true,
          businessEmail: true,
          kitchenOpenTime: true,
          kitchenCloseTime: true,
          contactPersonMobileNumber: true,
          taxRate: true,
          serviceChargeRate: true,
          discountRate: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      const items = await this.prisma.addMenuItem.findMany({
        where: {
          tenantId: resolved.tenantId,
          deletedAt: null,
          isActive: true,
          isAvailable: true,
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });

      return {
        restaurant: this.buildRestaurant(tenant, user),
        categories: this.groupCustomerMenuItems(items),
      };
    } catch (error) {
      console.error('Failed to load customer menu from add_menu_items:', error);
      return {
        restaurant: this.defaultRestaurant(),
        categories: [],
      };
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
    console.log('MANAGER CREATE TENANT', {
      userId: currentUser?.id ?? currentUser?.sub,
      tenantId,
    });

    const name = dto.name.trim();
    const categoryName = dto.category_name.trim();

    if (!name) {
      throw new BadRequestException('Menu item name is required.');
    }

    if (!categoryName) {
      throw new BadRequestException('Category is required.');
    }

    const lastItem = await this.prisma.addMenuItem.findFirst({
      where: { tenantId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

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
        sortOrder: (lastItem?.sortOrder ?? 0) + 1,
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

    const items = await this.prisma.addMenuItem.findMany({
      where: {
        tenantId,
        deletedAt: null,
        isActive: true,
        categoryName: { not: '' },
      },
      select: { categoryName: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const categoryMap = new Map<string, { name: string }>();

    for (const item of items) {
      const categoryName = item.categoryName.trim();
      const categoryKey = categoryName.toLowerCase();
      if (!categoryMap.has(categoryKey)) {
        categoryMap.set(categoryKey, { name: categoryName });
      }
    }

    return Array.from(categoryMap.values());
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

  private async resolveCustomerTenant(query: {
    tenantId?: string;
    slug?: string;
    authorization?: string;
  }): Promise<{ tenantId: string | null; source: 'query' | 'auth' | 'slug' | 'none' }> {
    const tenantId = query.tenantId?.trim();
    if (tenantId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      });

      if (!tenant) {
        return { tenantId: null, source: 'query' };
      }

      return { tenantId: tenant.id, source: 'query' };
    }

    const authTenantId = await this.resolveTenantIdFromAuthorization(query.authorization);
    if (authTenantId) {
      return { tenantId: authTenantId, source: 'auth' };
    }

    const slug = query.slug?.trim();
    if (slug) {
      const qrCode = await this.prisma.qrCode.findUnique({
        where: { slug },
        select: { tenantId: true, isActive: true },
      });

      if (!qrCode?.isActive) {
        return { tenantId: null, source: 'slug' };
      }

      return { tenantId: qrCode.tenantId, source: 'slug' };
    }

    return { tenantId: null, source: 'none' };
  }

  private async resolveTenantIdFromAuthorization(authorization?: string) {
    const [scheme, token] = authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    try {
      const payload = await this.jwt.verifyAsync<{ sub?: string; tenantId?: string }>(token);
      if (payload.tenantId) {
        return payload.tenantId;
      }

      if (!payload.sub) {
        return null;
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { tenantId: true, isActive: true },
      });

      return user?.isActive ? user.tenantId : null;
    } catch {
      return null;
    }
  }

  private defaultRestaurant() {
    return {
      id: null,
      name: 'MenuFlow',
      businessType: 'Menu',
      location: '',
      address: '',
      email: '',
      phone: '',
      kitchenOpenTime: '',
      kitchenCloseTime: '',
      openingHours: '',
      taxRate: 5,
      serviceChargeRate: 3,
      discountRate: 0,
      status: 'Kitchen open',
    };
  }

  private buildRestaurant(
    tenant: { id: string; name: string | null },
    user?: {
      hotelName: string | null;
      businessType: string | null;
      businessLocation: string | null;
      businessAddress: string | null;
      businessEmail: string | null;
      kitchenOpenTime: string | null;
      kitchenCloseTime: string | null;
      contactPersonMobileNumber: string | null;
      taxRate: any;
      serviceChargeRate: any;
      discountRate: any;
    } | null,
  ) {
    const kitchenOpenTime = this.formatKitchenCloseTime(user?.kitchenOpenTime);
    const kitchenCloseTime = this.formatKitchenCloseTime(user?.kitchenCloseTime);
    const openingHours = kitchenOpenTime && kitchenCloseTime
      ? `Daily ${kitchenOpenTime} - ${kitchenCloseTime}`
      : kitchenCloseTime
        ? `Daily - ${kitchenCloseTime}`
        : '';

    return {
      id: tenant.id,
      name: user?.hotelName?.trim() || tenant.name?.trim() || 'MenuFlow',
      businessType: user?.businessType?.trim() || 'Menu',
      location: user?.businessLocation?.trim() || '',
      address: user?.businessAddress?.trim() || '',
      email: user?.businessEmail?.trim() || '',
      phone: user?.contactPersonMobileNumber?.trim() || '',
      kitchenOpenTime,
      kitchenCloseTime,
      openingHours,
      taxRate: Number(user?.taxRate ?? 5),
      serviceChargeRate: Number(user?.serviceChargeRate ?? 3),
      discountRate: Number(user?.discountRate ?? 0),
      status: kitchenCloseTime ? `Kitchen open until ${kitchenCloseTime}` : 'Kitchen open',
    };
  }

  private formatKitchenCloseTime(value?: string | null) {
    const trimmed = value?.trim();
    if (!trimmed) {
      return '';
    }

    const candidate = trimmed.replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
    const amPmMatch = candidate.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
    if (amPmMatch) {
      const hour = Number(amPmMatch[1]);
      const minute = Number(amPmMatch[2] ?? '0');
      if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
        return `${hour}:${minute.toString().padStart(2, '0')} ${amPmMatch[3].toUpperCase()}`;
      }
    }

    const twentyFourHourMatch = candidate.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (twentyFourHourMatch) {
      const hour = Number(twentyFourHourMatch[1]);
      const minute = Number(twentyFourHourMatch[2]);
      const period = hour >= 12 ? 'PM' : 'AM';
      const twelveHour = hour % 12 || 12;
      return `${twelveHour}:${minute.toString().padStart(2, '0')} ${period}`;
    }

    return trimmed;
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
