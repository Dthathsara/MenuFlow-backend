import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { nanoid } from 'nanoid';
import { Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

const ORDER_STATUSES = ['accepted', 'preparing', 'ready', 'delivered', 'cancelled'] as const;

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async createCustomerOrder(dto: CreateOrderDto) {
    const tenantId = dto.tenant_id.trim();
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required.');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Restaurant not found.');
    }

    const settings = await this.prisma.user.findFirst({
      where: { tenantId, deletedAt: null },
      select: { taxRate: true, serviceChargeRate: true, discountRate: true },
      orderBy: { createdAt: 'asc' },
    });

    const subtotal = dto.items.reduce(
      (sum, item) => sum.plus(new Prisma.Decimal(item.unit_price).mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    const taxRate = settings?.taxRate ?? new Prisma.Decimal(5);
    const serviceChargeRate = settings?.serviceChargeRate ?? new Prisma.Decimal(3);
    const discountRate = settings?.discountRate ?? new Prisma.Decimal(0);
    const taxAmount = subtotal.mul(taxRate).div(100);
    const serviceChargeAmount = subtotal.mul(serviceChargeRate).div(100);
    const discountAmount = discountRate.gt(0) ? subtotal.mul(discountRate).div(100) : new Prisma.Decimal(0);
    const totalAmount = subtotal.plus(taxAmount).plus(serviceChargeAmount).minus(discountAmount);
    const paymentStatus = dto.payment?.status ?? 'unpaid';
    const now = new Date();

    const order = await this.prisma.order.create({
      data: {
        tenantId,
        orderNumber: this.generateOrderNumber(),
        customerSessionId: dto.customer_session_id.trim(),
        tableId: dto.table_id?.trim() || null,
        qrCodeId: dto.qr_code_id?.trim() || null,
        customerName: dto.customer_name.trim(),
        customerPhone: dto.customer_phone.trim(),
        orderType: dto.order_type,
        orderStatus: 'accepted',
        paymentStatus,
        subtotal,
        taxRate,
        taxAmount,
        serviceChargeRate,
        serviceChargeAmount,
        discountRate,
        discountAmount,
        totalAmount,
        itemNote: dto.item_note?.trim() || null,
        acceptedAt: now,
        items: {
          create: dto.items.map((item) => {
            const unitPrice = new Prisma.Decimal(item.unit_price);
            return {
              menuItemId: item.menu_item_id?.trim() || null,
              foodName: item.food_name.trim(),
              categoryName: item.category_name?.trim() || null,
              subCategoryName: item.sub_category_name?.trim() || null,
              servingSize: item.serving_size?.trim() || null,
              unitPrice,
              quantity: item.quantity,
              lineTotal: unitPrice.mul(item.quantity),
              prepTimeMin: item.prep_time_min ?? null,
              imageUrl: item.image_url?.trim() || null,
              itemNote: item.item_note?.trim() || null,
            };
          }),
        },
      },
      include: { items: true },
    });

    return this.mapOrder(order);
  }

  async findCustomerOrder(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }
    return this.mapOrder(order);
  }

  async findCustomerSessionOrders(customerSessionId: string) {
    const orders = await this.prisma.order.findMany({
      where: { customerSessionId, deletedAt: null },
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.mapOrder(order));
  }

  async findManagerOrders(currentUser: any) {
    const tenantId = this.requireTenantId(currentUser);
    const orders = await this.prisma.order.findMany({
      where: { tenantId, deletedAt: null },
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => this.mapOrder(order));
  }

  async updateManagerOrderStatus(id: string, dto: UpdateOrderStatusDto, currentUser: any) {
    const tenantId = this.requireTenantId(currentUser);
    if (!ORDER_STATUSES.includes(dto.order_status as any)) {
      throw new BadRequestException('Invalid order_status.');
    }

    const existing = await this.prisma.order.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Order not found.');
    }

    const timestampField = this.statusTimestampField(dto.order_status);
    const order = await this.prisma.order.update({
      where: { id },
      data: {
        orderStatus: dto.order_status,
        ...(timestampField ? { [timestampField]: new Date() } : {}),
      },
      include: { items: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } },
    });

    return this.mapOrder(order);
  }

  private requireTenantId(currentUser: any) {
    const tenantId = currentUser?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Your account is not connected to a restaurant.');
    }
    return tenantId;
  }

  private statusTimestampField(status: string) {
    const fields: Record<string, string> = {
      accepted: 'acceptedAt',
      preparing: 'preparingAt',
      ready: 'readyAt',
      delivered: 'deliveredAt',
      cancelled: 'cancelledAt',
    };
    return fields[status];
  }

  private generateOrderNumber() {
    const now = new Date();
    const pad = (value: number) => value.toString().padStart(2, '0');
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `ORD-${date}-${time}-${nanoid(4).toUpperCase()}`;
  }

  private mapOrder(order: any) {
    return {
      id: order.id,
      tenant_id: order.tenantId,
      order_number: order.orderNumber,
      customer_session_id: order.customerSessionId,
      table_id: order.tableId,
      qr_code_id: order.qrCodeId,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      order_type: order.orderType,
      order_status: order.orderStatus,
      payment_status: order.paymentStatus,
      subtotal: Number(order.subtotal),
      tax_rate: Number(order.taxRate),
      tax_amount: Number(order.taxAmount),
      service_charge_rate: Number(order.serviceChargeRate),
      service_charge_amount: Number(order.serviceChargeAmount),
      discount_rate: Number(order.discountRate ?? 0),
      discount_amount: Number(order.discountAmount),
      total_amount: Number(order.totalAmount),
      item_note: order.itemNote,
      placed_at: order.placedAt,
      accepted_at: order.acceptedAt,
      preparing_at: order.preparingAt,
      ready_at: order.readyAt,
      delivered_at: order.deliveredAt,
      cancelled_at: order.cancelledAt,
      created_at: order.createdAt,
      updated_at: order.updatedAt,
      deleted_at: order.deletedAt,
      items: (order.items ?? []).map((item: any) => ({
        id: item.id,
        order_id: item.orderId,
        menu_item_id: item.menuItemId,
        food_name: item.foodName,
        category_name: item.categoryName,
        sub_category_name: item.subCategoryName,
        serving_size: item.servingSize,
        unit_price: Number(item.unitPrice),
        quantity: item.quantity,
        line_total: Number(item.lineTotal),
        prep_time_min: item.prepTimeMin,
        image_url: item.imageUrl,
        item_note: item.itemNote,
        created_at: item.createdAt,
        updated_at: item.updatedAt,
        deleted_at: item.deletedAt,
      })),
    };
  }
}
