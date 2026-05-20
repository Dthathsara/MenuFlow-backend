import {
  Injectable, NotFoundException, ForbiddenException,
  ConflictException, Logger, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuDto, UpdateMenuDto } from './dto/menu.dto';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateSubCategoryDto, UpdateSubCategoryDto,
} from './dto/category.dto';
import {
  CreateMenuItemDto, UpdateMenuItemDto,
  UpdateMenuItemOptionDto, UpdatePriceDto,
} from './dto/menu-item.dto';
import { CreateQrCodeDto, UpdateQrCodeDto } from './dto/qr-code.dto';
import { nanoid } from 'nanoid';

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
        throw new ConflictException(`Category "${dto.name}" already exists for this tenant`);
      }
      throw e;
    }
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
        throw new ConflictException(`SubCategory "${dto.name}" already exists in this category`);
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

  async toggleAvailability(id: string) {
    const item = await this.findMenuItemById(id);
    return this.prisma.menuItem.update({
      where: { id },
      data: { isAvailable: !item.isAvailable },
      include: this.menuItemIncludes(),
    });
  }

  // ─── OPTIONS & PRICING ────────────────────────────────────────────────────

  async updateOptionPrice(
    optionId: string, dto: UpdatePriceDto, userId: string,
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
          note: dto.note ?? `Price changed from ${option.price} to ${dto.price}`,
        },
      });

      return tx.menuItemOption.update({
        where: { id: optionId },
        data: { price: option.price },
      });
    });
  }

  async updateOption(optionId: string, dto: UpdateMenuItemOptionDto, userId: string) {
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
              note: dto.priceChangeNote ?? `Price updated from ${option.price} to ${dto.price}`,
            },
          });
          await tx.menuItemOption.update({
            where: { id: optionId },
            data: {
              label: dto.label,
              price: option.price,
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
            businessEmail: true,
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
      history,
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
      .update({ where: { id: qrCode.id }, data: { scanCount: { increment: 1 } } })
      .catch((e) => this.logger.error('Failed to increment scan count', e));

    // If no menu linked, get all active menus for the tenant
    const where = qrCode.menuId
      ? { id: qrCode.menuId, deletedAt: null, isActive: true }
      : { tenantId: qrCode.tenantId, deletedAt: null, isActive: true };

    return this.prisma.menu.findMany({
      where,
      include: {
        menuItems: {
          where: { deletedAt: null, isActive: true },
          include: {
            category: true,
            subCategory: true,
            options: {
              where: { isAvailable: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
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
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    return tenant;
  }

  private async ensureCategoryExists(id: string) {
    const cat = await this.prisma.category.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException(`Category ${id} not found`);
    return cat;
  }
}
