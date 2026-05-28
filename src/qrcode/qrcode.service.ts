import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTableDto, UpdateTableDto } from './dto/table.dto';
import { CreateQrCodeDto, UpdateQrCodeDto, AssignStaffDto } from './dto/qrcode.dto';
import { nanoid } from 'nanoid';
import { AddMenuItemsService } from '../menu/add-menu-items.service';

@Injectable()
export class QrCodeService {
  private readonly logger = new Logger(QrCodeService.name);

  constructor(
    private prisma: PrismaService,
    private addMenuItemsService: AddMenuItemsService,
  ) {}

  // ─── TABLES ───────────────────────────────────────────────────────────────

  async createTable(dto: CreateTableDto) {
    await this.ensureTenantExists(dto.tenantId);

    try {
      return await this.prisma.table.create({
        data: {
          tenantId: dto.tenantId,
          number: dto.number.trim(),
          label: dto.label?.trim(),
        },
        include: { qrCode: { include: this.qrCodeIncludes() } },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(
          `Table number "${dto.number}" already exists for this tenant`,
        );
      }
      throw e;
    }
  }

  async findTablesByTenant(tenantId: string) {
    await this.ensureTenantExists(tenantId);
    return this.prisma.table.findMany({
      where: { tenantId },
      include: { qrCode: { include: this.qrCodeIncludes() } },
      orderBy: { number: 'asc' },
    });
  }

  async findTableById(id: string) {
    const table = await this.prisma.table.findUnique({
      where: { id },
      include: { qrCode: { include: this.qrCodeIncludes() } },
    });
    if (!table) throw new NotFoundException(`Table ${id} not found`);
    return table;
  }

  async updateTable(id: string, dto: UpdateTableDto) {
    await this.findTableById(id);
    try {
      return await this.prisma.table.update({
        where: { id },
        data: {
          ...(dto.number && { number: dto.number.trim() }),
          ...(dto.label !== undefined && { label: dto.label?.trim() }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: { qrCode: { include: this.qrCodeIncludes() } },
      });
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException(`Table number "${dto.number}" already exists`);
      }
      throw e;
    }
  }

  async deleteTable(id: string) {
    const table = await this.findTableById(id);
    if (table.qrCode) {
      throw new ConflictException(
        'Table has an active QR code. Delete the QR code first.',
      );
    }
    await this.prisma.table.delete({ where: { id } });
  }

  // ─── QR CODES ─────────────────────────────────────────────────────────────

  async createQrCode(dto: CreateQrCodeDto) {
    await this.ensureTenantExists(dto.tenantId);
    await this.ensureMenuBelongsToTenant(dto.menuId, dto.tenantId);
    await this.ensureTableBelongsToTenant(dto.tableId, dto.tenantId);

    // Validate all staff belong to the same tenant with STAFF role
    if (dto.staffIds?.length) {
      await this.validateStaffUsers(dto.staffIds, dto.tenantId);
    }

    const slug = nanoid(10);

    try {
      const qrCode = await this.prisma.qrCode.create({
        data: {
          tenantId: dto.tenantId,
          menuId: dto.menuId,
          tableId: dto.tableId,
          label: dto.label.trim(),
          slug,
          ...(dto.staffIds?.length && {
            staffLinks: {
              create: dto.staffIds.map((userId) => ({ userId })),
            },
          }),
        },
        include: this.qrCodeIncludes(),
      });

      return this.formatQrCodeResponse(qrCode);
    } catch (e: any) {
      if (e.code === 'P2002') {
        throw new ConflictException('This table already has a QR code assigned');
      }
      throw e;
    }
  }

  async findQrCodesByTenant(tenantId: string) {
    await this.ensureTenantExists(tenantId);
    const qrCodes = await this.prisma.qrCode.findMany({
      where: { tenantId },
      include: this.qrCodeIncludes(),
      orderBy: { createdAt: 'desc' },
    });
    return qrCodes.map((qr) => this.formatQrCodeResponse(qr));
  }

  async findQrCodeById(id: string) {
    const qrCode = await this.prisma.qrCode.findUnique({
      where: { id },
      include: this.qrCodeIncludes(),
    });
    if (!qrCode) throw new NotFoundException(`QR Code ${id} not found`);
    return this.formatQrCodeResponse(qrCode);
  }

  async findQrCodeBySlug(slug: string) {
    const qrCode = await this.prisma.qrCode.findUnique({
      where: { slug },
      include: this.qrCodeIncludes(),
    });
    if (!qrCode) throw new NotFoundException(`QR Code not found`);
    return this.formatQrCodeResponse(qrCode);
  }

  async updateQrCode(id: string, dto: UpdateQrCodeDto, tenantId: string) {
    const qrCode = await this.prisma.qrCode.findUnique({ where: { id } });
    if (!qrCode) throw new NotFoundException(`QR Code ${id} not found`);

    if (dto.menuId) {
      await this.ensureMenuBelongsToTenant(dto.menuId, tenantId);
    }

    return this.formatQrCodeResponse(
      await this.prisma.qrCode.update({
        where: { id },
        data: {
          ...(dto.menuId && { menuId: dto.menuId }),
          ...(dto.label && { label: dto.label.trim() }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
        include: this.qrCodeIncludes(),
      }),
    );
  }

  async deleteQrCode(id: string) {
    const qrCode = await this.prisma.qrCode.findUnique({ where: { id } });
    if (!qrCode) throw new NotFoundException(`QR Code ${id} not found`);
    // staffLinks cascade delete via Prisma schema
    await this.prisma.qrCode.delete({ where: { id } });
  }

  // ─── STAFF ASSIGNMENT ─────────────────────────────────────────────────────

  async assignStaff(qrCodeId: string, dto: AssignStaffDto, tenantId: string) {
    const qrCode = await this.prisma.qrCode.findUnique({
      where: { id: qrCodeId },
      include: { staffLinks: true },
    });
    if (!qrCode) throw new NotFoundException(`QR Code ${qrCodeId} not found`);

    await this.validateStaffUsers(dto.staffIds, tenantId);

    // Only add staff not already linked
    const existingUserIds = qrCode.staffLinks.map((l) => l.userId);
    const newUserIds = dto.staffIds.filter((id) => !existingUserIds.includes(id));

    if (!newUserIds.length) {
      throw new ConflictException('All provided staff are already assigned to this QR code');
    }

    await this.prisma.qrCodeStaff.createMany({
      data: newUserIds.map((userId) => ({ qrCodeId, userId })),
      skipDuplicates: true,
    });

    return this.findQrCodeById(qrCodeId);
  }

  async removeStaff(qrCodeId: string, userId: string) {
    const link = await this.prisma.qrCodeStaff.findUnique({
      where: { qrCodeId_userId: { qrCodeId, userId } },
    });
    if (!link) {
      throw new NotFoundException('Staff assignment not found');
    }
    await this.prisma.qrCodeStaff.delete({
      where: { qrCodeId_userId: { qrCodeId, userId } },
    });
    return this.findQrCodeById(qrCodeId);
  }

  async replaceStaff(qrCodeId: string, dto: AssignStaffDto, tenantId: string) {
    const qrCode = await this.prisma.qrCode.findUnique({ where: { id: qrCodeId } });
    if (!qrCode) throw new NotFoundException(`QR Code ${qrCodeId} not found`);

    if (dto.staffIds.length) {
      await this.validateStaffUsers(dto.staffIds, tenantId);
    }

    // Replace all staff in a transaction
    await this.prisma.$transaction([
      this.prisma.qrCodeStaff.deleteMany({ where: { qrCodeId } }),
      ...(dto.staffIds.length
        ? [
            this.prisma.qrCodeStaff.createMany({
              data: dto.staffIds.map((userId) => ({ qrCodeId, userId })),
            }),
          ]
        : []),
    ]);

    return this.findQrCodeById(qrCodeId);
  }

  // ─── PUBLIC SCAN ──────────────────────────────────────────────────────────

  async scanQrCode(slug: string) {
    const qrCode = await this.prisma.qrCode.findUnique({
      where: { slug },
      select: { id: true, isActive: true },
    });

    if (!qrCode || !qrCode.isActive) {
      throw new NotFoundException('Menu not found or this QR code is inactive');
    }

    // Non-blocking scan count increment
    this.prisma.qrCode
      .update({ where: { id: qrCode.id }, data: { scanCount: { increment: 1 } } })
      .catch((e) => this.logger.error('Failed to increment scan count', e));

    return this.addMenuItemsService.getCustomerMenu({ slug });
  }

  // ─── HELPERS ──────────────────────────────────────────────────────────────

  private qrCodeIncludes() {
    return {
      menu: { select: { id: true, name: true, isActive: true } },
      table: { select: { id: true, number: true, label: true } },
      staffLinks: {
        include: {
          user: {
            select: {
              id: true,
              contactPersonName: true,
              businessEmail: true,
              role: true,
            },
          },
        },
      },
    };
  }

  private formatQrCodeResponse(qrCode: any) {
    return {
      ...qrCode,
      assignedStaff: qrCode.staffLinks?.map((l: any) => l.user) ?? [],
      publicUrl: `${process.env.PUBLIC_URL}/menu/${qrCode.slug}`,
    };
  }

  private async validateStaffUsers(staffIds: string[], tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        id: { in: staffIds },
        tenantId,
        role: 'STAFF',
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (users.length !== staffIds.length) {
      const foundIds = users.map((u) => u.id);
      const invalid = staffIds.filter((id) => !foundIds.includes(id));
      throw new BadRequestException(
        `The following user IDs are not valid active STAFF members of this tenant: ${invalid.join(', ')}`,
      );
    }
  }

  private async ensureTenantExists(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException(`Tenant ${tenantId} not found`);
    return tenant;
  }

  private async ensureMenuBelongsToTenant(menuId: string, tenantId: string) {
    const menu = await this.prisma.menu.findFirst({
      where: { id: menuId, tenantId, deletedAt: null },
    });
    if (!menu) throw new NotFoundException(`Menu ${menuId} not found for this tenant`);
    return menu;
  }

  private async ensureTableBelongsToTenant(tableId: string, tenantId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, tenantId, isActive: true },
    });
    if (!table) {
      throw new NotFoundException(`Table ${tableId} not found or inactive for this tenant`);
    }
    return table;
  }
}
