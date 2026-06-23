import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
  BadRequestException,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';
import {
  CreateCategoryDto,
  UpdateCategoryDto,
  CreateManagerCategoryDto,
  CreateSubCategoryDto,
  UpdateSubCategoryDto,
} from './dto/category.dto';
import {
  CreateMenuItemDto,
  UpdateMenuItemDto,
  UpdateMenuItemOptionDto,
  UpdatePriceDto,
  AddMenuItemsQueryDto,
  CreateAddMenuItemDto,
  UpdateAddMenuItemDto,
} from './dto/menu-item.dto';
import { CreateQrCodeDto, UpdateQrCodeDto } from './dto/qr-code.dto';
import { nanoid } from 'nanoid';
import { AddMenuItem, Prisma } from '../generated/client';

@Injectable()
export class MenuService {
  private readonly logger = new Logger(MenuService.name);

  constructor(private prisma: PrismaService) {}

  // ─── MENUS ────────────────────────────────────────────────────────────────

  async createMenu(dto: CreateMenuDto) {
    await this.ensureTenantExists(dto.tenantId);
    return this.prisma.menu.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
      include: this.menuIncludes(),
    });
  }

  async findMenusByTenant(tenantId: string) {
    await this.ensureTenantExists(tenantId);
    return this.prisma.menu.findMany({
      where: { tenantId, deletedAt: null },
      include: this.menuIncludes(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findMenuById(id: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { id, deletedAt: null },
      include: this.menuIncludes(),
    });
    if (!menu) throw new NotFoundException(`Menu ${id} not found`);
    return menu;
  }

  async updateMenu(id: string, dto: UpdateMenuDto) {
    await this.findMenuById(id);
    return this.prisma.menu.update({
      where: { id },
      data: dto,
      include: this.menuIncludes(),
    });
  }

  async deleteMenu(id: string) {
    await this.findMenuById(id);
    await this.prisma.menu.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── CATEGORIES ───────────────────────────────────────────────────────────

  async createCategory(dto: CreateCategoryDto) {
    await this.ensureTenantExists(dto.tenantId);
    try {
      return await this.prisma.category.create({
        data: {
          tenantId: dto.tenantId,
          name: dto.name,
          description: dto.description,
          imageUrl: dto.imageUrl,
          sortOrder: dto.sortOrder ?? 0,
        },
        include: { subCategories: true },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `Category "${dto.name}" already exists for this tenant`,
        );
      }
      throw e;
    }
  }

  async createManagerCategory(dto: CreateManagerCategoryDto, currentUser: any) {
    const tenantId = await this.getTenantIdForUser(currentUser);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Category name is required');
    }
    return { name };
  }

  async findCategoriesByTenant(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId, isActive: true },
      include: {
        subCategories: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findManagerCategories(currentUser: any) {
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

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    await this.ensureCategoryExists(id);
    return this.prisma.category.update({
      where: { id },
      data: dto,
      include: { subCategories: true },
    });
  }

  async deleteCategory(id: string) {
    await this.ensureCategoryExists(id);
    // Check if any active menu items reference this category
    const itemCount = await this.prisma.menuItem.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (itemCount > 0) {
      throw new ConflictException(
        `Cannot delete category with ${itemCount} active menu items. Reassign or delete items first.`,
      );
    }
    await this.prisma.category.delete({ where: { id } });
  }

  async createSubCategory(dto: CreateSubCategoryDto) {
    await this.ensureCategoryExists(dto.categoryId);
    try {
      return await this.prisma.subCategory.create({
        data: {
          tenantId: dto.tenantId,
          categoryId: dto.categoryId,
          name: dto.name,
          description: dto.description,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `SubCategory "${dto.name}" already exists in this category`,
        );
      }
      throw e;
    }
  }

  async updateSubCategory(id: string, dto: UpdateSubCategoryDto) {
    const sub = await this.prisma.subCategory.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException(`SubCategory ${id} not found`);
    return this.prisma.subCategory.update({ where: { id }, data: dto });
  }

  async deleteSubCategory(id: string) {
    const sub = await this.prisma.subCategory.findUnique({ where: { id } });
    if (!sub) throw new NotFoundException(`SubCategory ${id} not found`);
    const itemCount = await this.prisma.menuItem.count({
      where: { subCategoryId: id, deletedAt: null },
    });
    if (itemCount > 0) {
      throw new ConflictException(
        `Cannot delete subcategory with ${itemCount} active menu items.`,
      );
    }
    await this.prisma.subCategory.delete({ where: { id } });
  }

  // ─── MENU ITEMS ───────────────────────────────────────────────────────────

  async findManagerMenuItems(currentUser: any, query: AddMenuItemsQueryDto) {
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

  async createManagerMenuItem(dto: CreateAddMenuItemDto, currentUser: any) {
    try {
      const tenantId = await this.getTenantIdForUser(currentUser);
      const imageUrl = this.normalizeImageUrl(dto.image_url);

      const itemName = dto.name.trim();
      if (!itemName) {
        throw new BadRequestException('Menu item name is required.');
      }

      const categoryName = dto.category_name?.trim();
      if (!categoryName) {
        throw new BadRequestException('Category is required.');
      }

      const item = await this.prisma.addMenuItem.create({
        data: {
          tenantId,
          name: itemName,
          categoryName,
          subCategoryName: dto.sub_category_name?.trim() || null,
          description: dto.description?.trim(),
          smallPrice: this.toDecimal(dto.small_price, 'small_price'),
          mediumPrice: this.toDecimal(dto.medium_price, 'medium_price'),
          largePrice: this.toDecimal(dto.large_price, 'large_price'),
          imageUrl,
          prepTimeMin: dto.prep_time_min,
          isAvailable: dto.is_available,
          isActive: true,
          sortOrder: 0,
        },
      });

      return this.mapAddMenuItem(item);
    } catch (error) {
      console.error('Create menu item failed:', error);
      this.handleKnownPrismaError(error);
    }
  }

  async updateManagerMenuItem(
    id: string,
    dto: UpdateAddMenuItemDto,
    currentUser: any,
  ) {
    try {
      const tenantId = await this.getTenantIdForUser(currentUser);
      await this.findManagerMenuItemById(id, tenantId);

      const itemData: Prisma.AddMenuItemUpdateInput = {};
      if (dto.name !== undefined) {
        const itemName = dto.name.trim();
        if (!itemName) {
          throw new BadRequestException('Menu item name is required.');
        }
        itemData.name = itemName;
      }
      if (dto.category_name !== undefined) {
        const categoryName = dto.category_name?.trim();
        if (!categoryName) {
          throw new BadRequestException('Category is required.');
        }
        itemData.categoryName = categoryName;
      }
      if (dto.sub_category_name !== undefined) {
        itemData.subCategoryName = dto.sub_category_name?.trim() || null;
      }
      if (dto.description !== undefined)
        itemData.description = dto.description?.trim();
      if (dto.image_url !== undefined)
        itemData.imageUrl = this.normalizeImageUrl(dto.image_url);
      if (dto.small_price !== undefined) {
        itemData.smallPrice = this.toDecimal(dto.small_price, 'small_price');
      }
      if (dto.medium_price !== undefined) {
        itemData.mediumPrice = this.toDecimal(dto.medium_price, 'medium_price');
      }
      if (dto.large_price !== undefined) {
        itemData.largePrice = this.toDecimal(dto.large_price, 'large_price');
      }
      if (dto.prep_time_min !== undefined)
        itemData.prepTimeMin = dto.prep_time_min;
      if (dto.is_available !== undefined)
        itemData.isAvailable = dto.is_available;

      const updated = await this.prisma.addMenuItem.update({
        where: { id },
        data: itemData,
      });

      return this.mapAddMenuItem(updated);
    } catch (error) {
      console.error('Update menu item failed:', error);
      this.handleKnownPrismaError(error);
    }
  }

  async deleteManagerMenuItem(id: string, currentUser: any) {
    const tenantId = await this.getTenantIdForUser(currentUser);
    await this.findManagerMenuItemById(id, tenantId);

    await this.prisma.addMenuItem.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async createMenuItem(dto: CreateMenuItemDto, userId: string) {
    await this.findMenuById(dto.menuId);

    // Ensure at least one option is marked as default
    const hasDefault = dto.options.some((o) => o.isDefault);
    if (!hasDefault) dto.options[0].isDefault = true;

    return this.prisma.$transaction(async (tx) => {
      const item = await tx.menuItem.create({
        data: {
          menuId: dto.menuId,
          tenantId: dto.tenantId,
          categoryId: dto.categoryId,
          subCategoryId: dto.subCategoryId,
          name: dto.name,
          description: dto.description,
          imageUrl: dto.imageUrl,
          prepTimeMin: dto.prepTimeMin,
          isAvailable: dto.isAvailable ?? true,
          tags: dto.tags ?? [],
          sortOrder: dto.sortOrder ?? 0,
          options: {
            create: dto.options.map((opt) => ({
              label: opt.label,
              price: opt.price,
              isDefault: opt.isDefault ?? false,
              isAvailable: opt.isAvailable ?? true,
              sortOrder: opt.sortOrder ?? 0,
            })),
          },
        },
        include: this.menuItemIncludes(),
      });

      // Record initial price history for each option
      await tx.priceHistory.createMany({
        data: item.options.map((opt) => ({
          optionId: opt.id,
          price: opt.price,
          changedById: userId,
          note: 'Initial price',
        })),
      });

      return item;
    });
  }

  async findMenuItems(menuId: string) {
    await this.findMenuById(menuId);
    return this.prisma.menuItem.findMany({
      where: { menuId, deletedAt: null, isActive: true },
      include: this.menuItemIncludes(),
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findMenuItemById(id: string) {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, deletedAt: null },
      include: this.menuItemIncludes(),
    });
    if (!item) throw new NotFoundException(`MenuItem ${id} not found`);
    return item;
  }

  async updateMenuItem(id: string, dto: UpdateMenuItemDto) {
    await this.findMenuItemById(id);
    return this.prisma.menuItem.update({
      where: { id },
      data: dto,
      include: this.menuItemIncludes(),
    });
  }

  async deleteMenuItem(id: string) {
    await this.findMenuItemById(id);
    await this.prisma.menuItem.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async toggleAvailability(id: string, currentUser?: any) {
    const tenantId = currentUser
      ? await this.getTenantIdForUser(currentUser)
      : undefined;
    if (!tenantId) {
      const item = await this.findMenuItemById(id);
      return this.prisma.menuItem.update({
        where: { id },
        data: { isAvailable: !item.isAvailable },
        include: this.menuItemIncludes(),
      });
    }

    const item = await this.findManagerMenuItemById(id, tenantId);
    const updated = await this.prisma.addMenuItem.update({
      where: { id },
      data: { isAvailable: !item.isAvailable },
    });
    return this.mapAddMenuItem(updated);
  }

  // ─── OPTIONS & PRICING ────────────────────────────────────────────────────

  async updateOptionPrice(
    optionId: string,
    dto: UpdatePriceDto,
    userId: string,
  ) {
    const option = await this.prisma.menuItemOption.findUnique({
      where: { id: optionId },
    });
    if (!option) throw new NotFoundException(`Option ${optionId} not found`);

    if (Number(option.price) === dto.price) {
      throw new BadRequestException('New price is the same as current price');
    }

    return this.prisma.$transaction(async (tx) => {
      // Record the old price in history before updating
      await tx.priceHistory.create({
        data: {
          optionId,
          price: option.price,
          changedById: userId,
          note:
            dto.note ?? `Price changed from ${option.price} to ${dto.price}`,
        },
      });

      return tx.menuItemOption.update({
        where: { id: optionId },
        data: { price: dto.price },
      });
    });
  }

  async updateOption(
    optionId: string,
    dto: UpdateMenuItemOptionDto,
    userId: string,
  ) {
    const option = await this.prisma.menuItemOption.findUnique({
      where: { id: optionId },
    });
    if (!option) throw new NotFoundException(`Option ${optionId} not found`);

    // If price is changing, record history
    if (dto.price !== undefined && Number(option.price) !== dto.price) {
      await this.prisma.$transaction(async (tx) => {
        await tx.priceHistory.create({
          data: {
            optionId,
            price: option.price,
            changedById: userId,
            note:
              dto.priceChangeNote ??
              `Price updated from ${option.price} to ${dto.price}`,
          },
        });
        await tx.menuItemOption.update({
          where: { id: optionId },
          data: {
            label: dto.label,
            price: dto.price,
            isDefault: dto.isDefault,
            isAvailable: dto.isAvailable,
            sortOrder: dto.sortOrder,
          },
        });
      });
      return this.prisma.menuItemOption.findUnique({ where: { id: optionId } });
    }

    return this.prisma.menuItemOption.update({
      where: { id: optionId },
      data: {
        label: dto.label,
        isDefault: dto.isDefault,
        isAvailable: dto.isAvailable,
        sortOrder: dto.sortOrder,
      },
    });
  }

  async getPriceHistory(optionId: string) {
    const option = await this.prisma.menuItemOption.findUnique({
      where: { id: optionId },
      include: { menuItem: { select: { name: true } } },
    });
    if (!option) throw new NotFoundException(`Option ${optionId} not found`);

    const history = await this.prisma.priceHistory.findMany({
      where: { optionId },
      include: {
        changedBy: {
          select: {
            id: true,
            contactPersonName: true,
            email: true,
          },
        },
      },
      orderBy: { effectiveAt: 'desc' },
    });

    return {
      option: {
        id: option.id,
        label: option.label,
        currentPrice: option.price,
        menuItemName: option.menuItem.name,
      },
      history: history.map((entry) => ({
        ...entry,
        changedBy: entry.changedBy
          ? {
              id: entry.changedBy.id,
              contactPersonName: entry.changedBy.contactPersonName,
              email: entry.changedBy.email,
            }
          : null,
      })),
    };
  }

  async getPublicMenu(slug: string) {
    const qrCode = await this.prisma.qrCode.findUnique({
      where: { slug },
    });

    if (!qrCode || !qrCode.isActive) {
      throw new NotFoundException('Menu not found or inactive');
    }

    // Increment scan count (non-blocking)
    this.prisma.qrCode
      .update({
        where: { id: qrCode.id },
        data: { scanCount: { increment: 1 } },
      })
      .catch((e) => this.logger.error('Failed to increment scan count', e));

    const menu = qrCode.menuId
      ? await this.prisma.menu.findFirst({
          where: { id: qrCode.menuId, deletedAt: null, isActive: true },
        })
      : null;

    const menuItems = await this.prisma.addMenuItem.findMany({
      where: {
        tenantId: qrCode.tenantId,
        deletedAt: null,
        isActive: true,
        isAvailable: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return [
      {
        id: menu?.id ?? null,
        tenantId: qrCode.tenantId,
        name: menu?.name ?? 'Menu',
        description: menu?.description ?? null,
        isActive: menu?.isActive ?? true,
        sortOrder: menu?.sortOrder ?? 0,
        createdAt: menu?.createdAt ?? qrCode.createdAt,
        updatedAt: menu?.updatedAt ?? qrCode.updatedAt,
        deletedAt: menu?.deletedAt ?? null,
        menuItems: menuItems.map((item) => this.mapAddMenuItem(item)),
      },
    ];
  }

  async updateQrCode(id: string, dto: UpdateQrCodeDto) {
    const qr = await this.prisma.qrCode.findUnique({ where: { id } });
    if (!qr) throw new NotFoundException(`QR Code ${id} not found`);
    if (dto.menuId) await this.findMenuById(dto.menuId);
    return this.prisma.qrCode.update({ where: { id }, data: dto });
  }

  async deleteQrCode(id: string) {
    const qr = await this.prisma.qrCode.findUnique({ where: { id } });
    if (!qr) throw new NotFoundException(`QR Code ${id} not found`);
    await this.prisma.qrCode.delete({ where: { id } });
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private getUserId(currentUser: any) {
    const userId =
      typeof currentUser === 'string'
        ? currentUser
        : (currentUser?.id ?? currentUser?.sub);
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
      throw new ForbiddenException(
        'Your account is not connected to a restaurant.',
      );
    }

    return user.tenantId;
  }

  private normalizeImageUrl(imageUrl?: string | null) {
    const maxImageUrlLength = 15 * 1024 * 1024;

    if (imageUrl === undefined) {
      return undefined;
    }

    if (imageUrl === null) {
      return null;
    }

    const trimmed = imageUrl.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed.length > maxImageUrlLength) {
      throw new BadRequestException(
        'Image is too large. Please upload an image under 10MB.',
      );
    }

    if (trimmed.startsWith('data:')) {
      if (
        !/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/i.test(
          trimmed,
        )
      ) {
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
      throw new BadRequestException(
        `${fieldName} must be a number greater than or equal to 0.`,
      );
    }

    return new Prisma.Decimal(numericValue);
  }

  private handleKnownPrismaError(error: any): never {
    if (error instanceof HttpException) {
      throw error;
    }

    if (error?.code === 'P2002') {
      throw new ConflictException(
        'A record with these details already exists.',
      );
    }

    if (error?.code === 'P2003') {
      throw new BadRequestException(
        'Invalid related record. Please refresh and try again.',
      );
    }

    if (error?.code === 'P2025') {
      throw new NotFoundException('Requested record was not found.');
    }

    throw error;
  }

  private async findManagerMenuItemById(id: string, tenantId: string) {
    const item = await this.prisma.addMenuItem.findFirst({
      where: { id, tenantId, deletedAt: null, isActive: true },
    });

    if (!item) {
      throw new NotFoundException(`AddMenuItem ${id} not found`);
    }

    return item;
  }

  private async ensureCategoryBelongsToTenant(
    categoryId: string,
    tenantId: string,
  ) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, tenantId, isActive: true },
      select: { id: true, name: true },
    });

    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }

    return category;
  }

  private async resolveManagerCategory(
    tenantId: string,
    dto: { category_id?: string; category_name?: string },
    required = true,
  ) {
    if (dto.category_id) {
      return this.ensureCategoryBelongsToTenant(dto.category_id, tenantId);
    }

    if (dto.category_name?.trim()) {
      return this.findOrCreateCategoryByName(tenantId, dto.category_name);
    }

    if (required) {
      throw new BadRequestException('Category is required.');
    }

    return null;
  }

  private async findOrCreateCategoryByName(tenantId: string, name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Category name is required');
    }

    const existing = await this.prisma.category.findFirst({
      where: {
        tenantId,
        isActive: true,
        name: { equals: trimmedName, mode: 'insensitive' },
      },
      select: { id: true, name: true },
    });

    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.category.create({
        data: {
          tenantId,
          name: trimmedName,
          sortOrder: 0,
          isActive: true,
        },
        select: { id: true, name: true },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        const category = await this.prisma.category.findFirst({
          where: { tenantId, name: trimmedName },
          select: { id: true, name: true },
        });
        if (category) return category;
      }
      throw e;
    }
  }

  private async resolveManagerSubCategory(
    client: any,
    tenantId: string,
    categoryId: string | null | undefined,
    dto: { sub_category_name?: string | null; sub_category_id?: string | null },
  ) {
    const hasSubCategoryName = Object.prototype.hasOwnProperty.call(
      dto,
      'sub_category_name',
    );
    const hasSubCategoryId = Object.prototype.hasOwnProperty.call(
      dto,
      'sub_category_id',
    );

    if (hasSubCategoryName) {
      return this.findOrCreateSubCategory(
        client,
        tenantId,
        categoryId,
        dto.sub_category_name,
      );
    }

    if (!hasSubCategoryId) {
      return null;
    }

    if (!dto.sub_category_id) {
      return null;
    }

    if (!categoryId) {
      throw new BadRequestException('Sub category requires a category.');
    }

    const subCategory = await client.subCategory.findFirst({
      where: {
        id: dto.sub_category_id,
        tenantId,
        categoryId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!subCategory) {
      throw new NotFoundException(
        `SubCategory ${dto.sub_category_id} not found`,
      );
    }

    return subCategory.id;
  }

  private async findOrCreateSubCategory(
    client: any,
    tenantId: string,
    categoryId: string | null | undefined,
    subCategoryName?: string | null,
  ) {
    const trimmedName = subCategoryName?.trim() ?? '';
    if (!trimmedName) {
      return null;
    }

    if (!categoryId) {
      throw new BadRequestException('Sub category requires a category.');
    }

    const category = await client.category.findFirst({
      where: { id: categoryId, tenantId, isActive: true },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException(`Category ${categoryId} not found`);
    }

    const existing = await client.subCategory.findFirst({
      where: {
        tenantId,
        categoryId,
        isActive: true,
        name: { equals: trimmedName, mode: 'insensitive' },
      },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    try {
      const created = await client.subCategory.create({
        data: {
          tenantId,
          categoryId,
          name: trimmedName,
          isActive: true,
          sortOrder: 0,
        },
        select: { id: true },
      });

      return created.id;
    } catch (e: any) {
      if (e.code === 'P2002') {
        const subCategory = await client.subCategory.findFirst({
          where: { tenantId, categoryId, name: trimmedName },
          select: { id: true },
        });
        if (subCategory) return subCategory.id;
      }
      throw e;
    }
  }

  private async resolveManagerMenu(tenantId: string, menuId?: string) {
    if (menuId) {
      const menu = await this.prisma.menu.findFirst({
        where: { id: menuId, tenantId, deletedAt: null, isActive: true },
        select: { id: true },
      });

      if (!menu) {
        throw new NotFoundException(`Menu ${menuId} not found`);
      }

      return menu;
    }

    const existingMenu = await this.prisma.menu.findFirst({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { id: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (existingMenu) {
      return existingMenu;
    }

    return this.prisma.menu.create({
      data: {
        tenantId,
        name: 'Default Menu',
        isActive: true,
        sortOrder: 0,
      },
      select: { id: true },
    });
  }

  private sizeOptionsFromPrices(dto: CreateAddMenuItemDto) {
    return [
      { label: 'Small', price: dto.small_price, sortOrder: 1 },
      { label: 'Medium', price: dto.medium_price, sortOrder: 2 },
      { label: 'Large', price: dto.large_price, sortOrder: 3 },
    ];
  }

  private async upsertSizeOption(
    tx: any,
    menuItemId: string,
    label: 'Small' | 'Medium' | 'Large',
    price: number | undefined,
    sortOrder: number,
  ) {
    if (price === undefined) {
      return;
    }

    const options = await tx.menuItemOption.findMany({
      where: { menuItemId },
      select: { id: true, label: true, price: true },
    });
    const existing = options.find(
      (option) => option.label.toLowerCase() === label.toLowerCase(),
    );

    if (existing) {
      if (Number(existing.price) !== price) {
        await tx.priceHistory.create({
          data: {
            optionId: existing.id,
            price: existing.price,
            note: `Price updated from ${existing.price} to ${price}`,
          },
        });
      }

      await tx.menuItemOption.update({
        where: { id: existing.id },
        data: {
          label,
          price,
          isAvailable: true,
          sortOrder,
        },
      });
      return;
    }

    await tx.menuItemOption.create({
      data: {
        menuItemId,
        label,
        price,
        isDefault: label === 'Medium',
        isAvailable: true,
        sortOrder,
      },
    });
  }

  private toManagerMenuItemResponse(item: any) {
    const optionPrice = (label: string) => {
      const option = item.options?.find(
        (candidate: any) =>
          candidate.label?.toLowerCase() === label.toLowerCase(),
      );
      return Number(option?.price ?? 0);
    };

    return {
      id: item.id,
      name: item.name,
      description: item.description,
      image_url: item.imageUrl,
      category_id: item.categoryId,
      category: item.category
        ? { id: item.category.id, name: item.category.name }
        : null,
      category_name: item.category?.name ?? '',
      sub_category_name: item.subCategory?.name ?? '',
      prep_time_min: item.prepTimeMin,
      is_available: item.isAvailable,
      small_price: optionPrice('Small'),
      medium_price: optionPrice('Medium'),
      large_price: optionPrice('Large'),
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
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

  private publicMenuItemSelect() {
    return {
      id: true,
      name: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      subCategoryId: true,
      subCategory: { select: { id: true, name: true } },
      description: true,
      imageUrl: true,
      options: {
        select: {
          id: true,
          label: true,
          price: true,
          isDefault: true,
          isAvailable: true,
          sortOrder: true,
        },
        orderBy: { sortOrder: 'asc' as const },
      },
      prepTimeMin: true,
      isAvailable: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private menuIncludes() {
    return {
      menuItems: {
        where: { deletedAt: null, isActive: true },
        include: this.menuItemIncludes(),
        orderBy: [{ sortOrder: 'asc' as const }, { name: 'asc' as const }],
      },
    };
  }

  private menuItemIncludes() {
    return {
      category: { select: { id: true, name: true } },
      subCategory: { select: { id: true, name: true } },
      options: {
        orderBy: { sortOrder: 'asc' as const },
      },
    };
  }

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    return tenant;
  }

  private async ensureCategoryExists(id: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    return cat;
  }
}
